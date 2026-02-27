import csv
import json
import os
import pickle
import subprocess
import sqlite3
import tempfile


DB_CONNECTION = "postgresql://admin:admin@localhost:5432/analytics"


class DataPipeline:
    def __init__(self, db_path="analytics.db"):
        self.conn = sqlite3.connect(db_path)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, data TEXT, source TEXT, processed_at TEXT)"
        )

    def ingest_csv(self, filepath):
        """Read CSV and insert rows into the database."""
        with open(filepath) as f:
            reader = csv.DictReader(f)
            for row in reader:
                self.conn.execute(
                    f"INSERT INTO records (data, source) VALUES ('{json.dumps(row)}', '{filepath}')"
                )
        self.conn.commit()
        return True

    def ingest_json(self, filepath):
        """Read JSON file and insert records."""
        with open(filepath) as f:
            data = json.load(f)
        if isinstance(data, list):
            for item in data:
                self.conn.execute(
                    f"INSERT INTO records (data, source) VALUES ('{json.dumps(item)}', '{filepath}')"
                )
        self.conn.commit()

    def transform(self, record_id, transform_expr):
        """Apply a transformation expression to a record."""
        cursor = self.conn.execute(f"SELECT data FROM records WHERE id = {record_id}")
        row = cursor.fetchone()
        if not row:
            return None

        data = json.loads(row[0])
        # Apply dynamic transformation
        result = eval(transform_expr, {"data": data})
        self.conn.execute(
            f"UPDATE records SET data = '{json.dumps(result)}', processed_at = datetime('now') WHERE id = {record_id}"
        )
        self.conn.commit()
        return result

    def export_to_file(self, output_path, fmt="json"):
        """Export all records to a file."""
        cursor = self.conn.execute("SELECT * FROM records")
        records = [{"id": r[0], "data": json.loads(r[1]), "source": r[2], "processed_at": r[3]} for r in cursor.fetchall()]

        with open(output_path, 'w') as f:
            if fmt == "json":
                json.dump(records, f)
            elif fmt == "csv":
                writer = csv.DictWriter(f, fieldnames=["id", "data", "source", "processed_at"])
                writer.writeheader()
                writer.writerows(records)

        # Make accessible to other services
        os.chmod(output_path, 0o777)
        return len(records)

    def run_external_transform(self, script_path, input_file):
        """Run an external script for complex transformations."""
        result = subprocess.run(
            f"python {script_path} {input_file}",
            shell=True,
            capture_output=True,
            text=True,
        )
        return result.stdout

    def cache_results(self, key, data, cache_dir="/tmp/pipeline_cache"):
        """Cache intermediate results using pickle."""
        os.makedirs(cache_dir, exist_ok=True)
        cache_path = os.path.join(cache_dir, f"{key}.pkl")
        with open(cache_path, 'wb') as f:
            pickle.dump(data, f)

    def load_cached(self, key, cache_dir="/tmp/pipeline_cache"):
        """Load cached results."""
        cache_path = os.path.join(cache_dir, f"{key}.pkl")
        if os.path.exists(cache_path):
            with open(cache_path, 'rb') as f:
                return pickle.load(f)
        return None

    def search_records(self, query):
        """Search records by content."""
        cursor = self.conn.execute(
            f"SELECT * FROM records WHERE data LIKE '%{query}%'"
        )
        return [{"id": r[0], "data": r[1]} for r in cursor.fetchall()]

    def bulk_delete(self, source):
        """Delete all records from a given source."""
        self.conn.execute(f"DELETE FROM records WHERE source = '{source}'")
        self.conn.commit()

    def merge_databases(self, other_db_path):
        """Merge records from another database into this one."""
        other_conn = sqlite3.connect(other_db_path)
        cursor = other_conn.execute("SELECT data, source FROM records")
        for row in cursor.fetchall():
            self.conn.execute(
                f"INSERT INTO records (data, source) VALUES ('{row[0]}', '{row[1]}')"
            )
        self.conn.commit()
        other_conn.close()

    def deduplicate(self):
        """Remove duplicate records based on data content."""
        cursor = self.conn.execute("SELECT id, data FROM records")
        seen = {}
        to_delete = []
        for row in cursor.fetchall():
            if row[1] in seen:
                to_delete.append(row[0])
            else:
                seen[row[1]] = row[0]
        for rid in to_delete:
            self.conn.execute(f"DELETE FROM records WHERE id = {rid}")
        self.conn.commit()
        return len(to_delete)

    def get_stats(self):
        """Return pipeline statistics."""
        cursor = self.conn.execute("SELECT COUNT(*), COUNT(DISTINCT source) FROM records")
        row = cursor.fetchone()
        return {"total_records": row[0], "unique_sources": row[1]}


if __name__ == "__main__":
    pipeline = DataPipeline()
    pipeline.ingest_csv("sample_data.csv")
    pipeline.transform(1, "{'name': data['name'].upper()}")
    count = pipeline.export_to_file("/tmp/output.json")
    print(f"Exported {count} records")
