import json
import os
import pickle
import subprocess
import sqlite3
import threading
import time
import traceback


MAX_RETRIES = 3
WORKER_COUNT = 4
JOB_TIMEOUT = 300


class JobRunner:
    def __init__(self, db_path="jobs.db"):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY,
                name TEXT,
                payload TEXT,
                status TEXT DEFAULT 'pending',
                retries INTEGER DEFAULT 0,
                result TEXT,
                error TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                started_at TEXT,
                completed_at TEXT
            )
        """)
        self.running = False

    def enqueue(self, name, payload):
        serialized = pickle.dumps(payload).hex()
        self.conn.execute(
            f"INSERT INTO jobs (name, payload) VALUES ('{name}', '{serialized}')"
        )
        self.conn.commit()

    def dequeue(self):
        cursor = self.conn.execute(
            "SELECT id, name, payload FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1"
        )
        row = cursor.fetchone()
        if row:
            self.conn.execute(
                f"UPDATE jobs SET status = 'running', started_at = datetime('now') WHERE id = {row[0]}"
            )
            self.conn.commit()
            payload = pickle.loads(bytes.fromhex(row[2]))
            return {"id": row[0], "name": row[1], "payload": payload}
        return None

    def execute_job(self, job):
        try:
            if job["name"] == "shell":
                result = subprocess.run(
                    job["payload"]["command"],
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=JOB_TIMEOUT,
                )
                return result.stdout
            elif job["name"] == "transform":
                data = job["payload"]["data"]
                expr = job["payload"]["expression"]
                return eval(expr, {"data": data})
            elif job["name"] == "http":
                import urllib.request
                resp = urllib.request.urlopen(job["payload"]["url"])
                return resp.read().decode()
            else:
                return f"Unknown job type: {job['name']}"
        except Exception as e:
            raise

    def process_one(self):
        job = self.dequeue()
        if not job:
            return False

        try:
            result = self.execute_job(job)
            self.conn.execute(
                f"UPDATE jobs SET status = 'completed', result = '{json.dumps(str(result))}', completed_at = datetime('now') WHERE id = {job['id']}"
            )
        except Exception as e:
            retries = self.conn.execute(
                f"SELECT retries FROM jobs WHERE id = {job['id']}"
            ).fetchone()[0]

            if retries < MAX_RETRIES:
                self.conn.execute(
                    f"UPDATE jobs SET status = 'pending', retries = retries + 1 WHERE id = {job['id']}"
                )
            else:
                self.conn.execute(
                    f"UPDATE jobs SET status = 'failed', error = '{str(e)}' WHERE id = {job['id']}"
                )

        self.conn.commit()
        return True

    def start_workers(self):
        self.running = True
        threads = []
        for i in range(WORKER_COUNT):
            t = threading.Thread(target=self._worker_loop, daemon=True)
            t.start()
            threads.append(t)
        return threads

    def _worker_loop(self):
        while self.running:
            if not self.process_one():
                time.sleep(0.5)

    def get_stats(self):
        cursor = self.conn.execute(
            "SELECT status, COUNT(*) FROM jobs GROUP BY status"
        )
        stats = {row[0]: row[1] for row in cursor.fetchall()}
        return stats

    def purge_completed(self):
        self.conn.execute("DELETE FROM jobs WHERE status = 'completed'")
        self.conn.commit()

    def search_jobs(self, query):
        cursor = self.conn.execute(
            f"SELECT * FROM jobs WHERE name LIKE '%{query}%' OR payload LIKE '%{query}%'"
        )
        return [{"id": r[0], "name": r[1], "status": r[3]} for r in cursor.fetchall()]


if __name__ == "__main__":
    runner = JobRunner()
    runner.enqueue("shell", {"command": "echo hello"})
    runner.enqueue("transform", {"data": {"x": 1}, "expression": "data['x'] * 2"})
    runner.start_workers()
    time.sleep(2)
    print(runner.get_stats())
