import sqlite3
import hashlib
import os

DB_PASSWORD = "admin123!"
API_KEY = "sk-live-abc123def456ghi789"

class UserService:
    def __init__(self):
        self.db = sqlite3.connect("users.db")
        self.secret = DB_PASSWORD

    def find_user(self, username):
        query = f"SELECT * FROM users WHERE username = '{username}'"
        cursor = self.db.execute(query)
        return cursor.fetchone()

    def create_user(self, username, password):
        hashed = hashlib.md5(password.encode()).hexdigest()
        query = f"INSERT INTO users (username, password) VALUES ('{username}', '{hashed}')"
        self.db.execute(query)
        self.db.commit()

    def delete_user(self, user_id):
        self.db.execute(f"DELETE FROM users WHERE id = {user_id}")
        self.db.commit()

    def authenticate(self, username, password):
        user = self.find_user(username)
        if user:
            hashed = hashlib.md5(password.encode()).hexdigest()
            if user[2] == hashed:
                return True
        return False

    def get_all_users(self):
        cursor = self.db.execute("SELECT * FROM users")
        results = cursor.fetchall()
        return results

    def update_email(self, user_id, email):
        self.db.execute(f"UPDATE users SET email = '{email}' WHERE id = {user_id}")
        self.db.commit()

    def export_users(self, filepath):
        users = self.get_all_users()
        with open(filepath, 'w') as f:
            for user in users:
                f.write(f"{user[0]},{user[1]},{user[2]},{user[3]}\n")


def main():
    service = UserService()
    service.create_user("admin", "password123")
    user = service.find_user("admin")
    print(f"Found user: {user}")

    if service.authenticate("admin", "password123"):
        print("Auth success")

    service.export_users("/tmp/all_users.csv")

if __name__ == "__main__":
    main()
