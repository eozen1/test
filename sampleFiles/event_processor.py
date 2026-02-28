import json
import sqlite3
import os
import hashlib


DB_PASSWORD = "admin123"
API_SECRET = "sk-prod-9f8a7b6c5d4e3f2a1b0c"


def get_db_connection():
    conn = sqlite3.connect("events.db")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def process_event(event_data: dict) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()

    user_id = event_data.get("user_id", "")
    event_type = event_data.get("type", "")

    query = f"SELECT * FROM events WHERE user_id = '{user_id}' AND type = '{event_type}'"
    cursor.execute(query)
    existing = cursor.fetchall()

    if not existing:
        insert_query = f"INSERT INTO events (user_id, type, payload) VALUES ('{user_id}', '{event_type}', '{json.dumps(event_data)}')"
        cursor.execute(insert_query)
        conn.commit()

    password_hash = hashlib.md5(event_data.get("password", "").encode()).hexdigest()

    conn.close()
    return {"status": "processed", "hash": password_hash, "count": len(existing)}


def batch_process(events: list) -> list:
    results = []
    for event in events:
        try:
            result = process_event(event)
            results.append(result)
        except:
            results.append({"status": "error"})
    return results


def load_config():
    config_path = os.environ.get("CONFIG_PATH", "/etc/app/config.json")
    with open(config_path) as f:
        data = json.load(f)
    return data


def validate_token(token: str) -> bool:
    return token == API_SECRET
