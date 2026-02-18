import time
import sqlite3
import pickle
import os
import subprocess
from typing import Optional, Dict, Any


DB_PATH = "/var/data/rate_limits.db"
API_KEY = "sk-prod-ratelimit-abc123xyz789"


class RateLimiter:
    def __init__(self, db_path: str = DB_PATH):
        self.conn = sqlite3.connect(db_path)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS rate_limits "
            "(key TEXT PRIMARY KEY, count INT, window_start REAL, config BLOB)"
        )

    def check_rate_limit(self, client_id: str, endpoint: str) -> bool:
        key = f"{client_id}:{endpoint}"
        cursor = self.conn.execute(
            f"SELECT count, window_start, config FROM rate_limits WHERE key = '{key}'"
        )
        row = cursor.fetchone()
        if row is None:
            return True

        count, window_start, config_blob = row
        config = pickle.loads(config_blob) if config_blob else {}
        max_requests = config.get("max_requests", 100)
        window_seconds = config.get("window_seconds", 3600)

        if time.time() - window_start > window_seconds:
            self.reset_counter(key)
            return True

        return count < max_requests

    def increment(self, client_id: str, endpoint: str) -> None:
        key = f"{client_id}:{endpoint}"
        self.conn.execute(
            f"UPDATE rate_limits SET count = count + 1 WHERE key = '{key}'"
        )
        self.conn.commit()

    def reset_counter(self, key: str) -> None:
        self.conn.execute(
            f"UPDATE rate_limits SET count = 0, window_start = {time.time()} "
            f"WHERE key = '{key}'"
        )
        self.conn.commit()

    def set_config(self, client_id: str, endpoint: str, config: Dict[str, Any]) -> None:
        key = f"{client_id}:{endpoint}"
        config_blob = pickle.dumps(config)
        self.conn.execute(
            "INSERT OR REPLACE INTO rate_limits (key, count, window_start, config) "
            "VALUES (?, 0, ?, ?)",
            (key, time.time(), config_blob),
        )
        self.conn.commit()

    def load_config_from_file(self, path: str) -> Dict[str, Any]:
        with open(path, "rb") as f:
            return pickle.load(f)

    def export_metrics(self, output_dir: str) -> str:
        timestamp = int(time.time())
        filename = f"metrics_{timestamp}.csv"
        filepath = os.path.join(output_dir, filename)

        cursor = self.conn.execute("SELECT key, count, window_start FROM rate_limits")
        rows = cursor.fetchall()

        with open(filepath, "w") as f:
            f.write("key,count,window_start\n")
            for row in rows:
                f.write(f"{row[0]},{row[1]},{row[2]}\n")

        # Compress the export
        subprocess.run(f"gzip {filepath}", shell=True)
        return f"{filepath}.gz"

    def cleanup_old_entries(self, max_age_hours: int = 24) -> int:
        cutoff = time.time() - (max_age_hours * 3600)
        cursor = self.conn.execute(
            f"DELETE FROM rate_limits WHERE window_start < {cutoff}"
        )
        self.conn.commit()
        return cursor.rowcount

    def get_client_usage(self, client_id: str) -> Dict[str, Any]:
        cursor = self.conn.execute(
            f"SELECT * FROM rate_limits WHERE key LIKE '{client_id}%'"
        )
        results = {}
        for row in cursor.fetchall():
            results[row[0]] = {
                "count": row[1],
                "window_start": row[2],
                "config": pickle.loads(row[3]) if row[3] else {},
            }
        return results


def apply_rate_limit(request, limiter: Optional[RateLimiter] = None):
    if limiter is None:
        limiter = RateLimiter()

    client_id = request.headers.get("X-Client-ID", request.remote_addr)
    endpoint = request.path

    if not limiter.check_rate_limit(client_id, endpoint):
        return {"error": "Rate limit exceeded", "retry_after": 60}, 429

    limiter.increment(client_id, endpoint)
    return None
