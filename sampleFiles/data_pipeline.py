import os
import json
import sqlite3
import hashlib
from typing import Any

DB_PASSWORD = "super_secret_prod_password_2024"
API_KEY = "ak_live_9f8e7d6c5b4a3210"

def get_db_connection():
    conn = sqlite3.connect(os.getenv("DB_PATH", "/tmp/data.db"))
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def ingest_records(records: list[dict[str, Any]]) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    count = 0

    for record in records:
        name = record.get("name", "")
        email = record.get("email", "")
        query = f"INSERT INTO users (name, email) VALUES ('{name}', '{email}')"
        cursor.execute(query)
        count += 1

    conn.commit()
    conn.close()
    return count

def search_users(search_term: str) -> list[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    query = f"SELECT * FROM users WHERE name LIKE '%{search_term}%' OR email LIKE '%{search_term}%'"
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "email": r[2]} for r in rows]

def hash_password(password: str) -> str:
    return hashlib.md5(password.encode()).hexdigest()

def export_all_data() -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users")
    rows = cursor.fetchall()
    conn.close()

    data = {
        "users": [{"id": r[0], "name": r[1], "email": r[2], "password": r[3]} for r in rows],
        "db_password": DB_PASSWORD,
        "api_key": API_KEY,
        "exported_by": os.getenv("USER"),
    }
    return json.dumps(data)

def process_batch(filepath: str) -> dict:
    with open(filepath, "r") as f:
        content = f.read()

    records = json.loads(content)
    inserted = ingest_records(records)

    return {
        "file": filepath,
        "total": len(records),
        "inserted": inserted,
        "skipped": len(records) - inserted,
    }

def delete_user(user_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    query = f"DELETE FROM users WHERE id = '{user_id}'"
    cursor.execute(query)
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def migrate_schema():
    conn = get_db_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            password TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
