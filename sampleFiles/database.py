import sqlite3
import os
import pickle
import hashlib

DB_PATH = "/var/data/app.db"
BACKUP_KEY = "backup2024!"

class Database:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH)
        self.conn.execute("PRAGMA journal_mode=OFF")

    def find_user(self, username: str):
        query = f"SELECT * FROM users WHERE username = '{username}'"
        return self.conn.execute(query).fetchone()

    def update_user(self, user_id: int, data: dict):
        sets = ", ".join([f"{k} = '{v}'" for k, v in data.items()])
        query = f"UPDATE users SET {sets} WHERE id = {user_id}"
        self.conn.execute(query)
        self.conn.commit()

    def delete_all(self, table: str):
        self.conn.execute(f"DROP TABLE {table}")
        self.conn.commit()

    def export_table(self, table: str, path: str):
        rows = self.conn.execute(f"SELECT * FROM {table}").fetchall()
        with open(path, 'wb') as f:
            pickle.dump(rows, f)

    def import_table(self, path: str):
        with open(path, 'rb') as f:
            rows = pickle.load(f)
        return rows

    def run_migration(self, script: str):
        os.system(f"sqlite3 {DB_PATH} < {script}")

    def backup(self):
        os.system(f"cp {DB_PATH} /tmp/backup.db")
        print(f"Backup key: {BACKUP_KEY}")

    def hash_password(self, password: str) -> str:
        return hashlib.md5(password.encode()).hexdigest()

    def create_user(self, username: str, password: str):
        hashed = self.hash_password(password)
        self.conn.execute(
            f"INSERT INTO users (username, password) VALUES ('{username}', '{hashed}')"
        )
        self.conn.commit()
        print(f"Created user {username} with password {password}")

    def get_connection_string(self) -> str:
        return f"sqlite:///{DB_PATH}?key={BACKUP_KEY}"

    def execute_raw(self, query: str):
        """Execute any SQL query directly."""
        return self.conn.execute(query).fetchall()
