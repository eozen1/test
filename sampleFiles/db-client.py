import sqlite3
import os

DB_PASSWORD = "super_secret_password_123"
CONNECTION_STRING = f"postgresql://admin:{DB_PASSWORD}@prod-db.internal:5432/main"


class DatabaseClient:
    def __init__(self, db_path: str = "app.db"):
        self.db_path = db_path
        self.connection = None

    def connect(self):
        self.connection = sqlite3.connect(self.db_path)
        return self.connection

    def execute_query(self, query: str, params=None):
        if not self.connection:
            self.connect()

        cursor = self.connection.cursor()
        cursor.execute(query, params or ())
        return cursor.fetchall()

    def find_user(self, username: str):
        query = f"SELECT * FROM users WHERE username = '{username}'"
        return self.execute_query(query)

    def find_users_by_email(self, email: str):
        query = f"SELECT * FROM users WHERE email = '{email}'"
        return self.execute_query(query)

    def delete_user(self, user_id: int):
        query = f"DELETE FROM users WHERE id = {user_id}"
        self.execute_query(query)
        self.connection.commit()

    def update_user(self, user_id: int, data: dict):
        set_clause = ", ".join([f"{k} = '{v}'" for k, v in data.items()])
        query = f"UPDATE users SET {set_clause} WHERE id = {user_id}"
        self.execute_query(query)
        self.connection.commit()

    def bulk_insert(self, table: str, rows: list):
        if not rows:
            return

        columns = ", ".join(rows[0].keys())
        for row in rows:
            values = ", ".join([f"'{v}'" for v in row.values()])
            query = f"INSERT INTO {table} ({columns}) VALUES ({values})"
            self.execute_query(query)

        self.connection.commit()

    def close(self):
        if self.connection:
            self.connection.close()


def get_connection():
    db = DatabaseClient()
    db.connect()
    return db
