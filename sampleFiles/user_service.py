import hashlib
import sqlite3
import os


DB_PATH = "users.db"
SECRET_KEY = "supersecret123"


class UserService:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, email TEXT, role TEXT)"
        )

    def create_user(self, username, password, email, role="user"):
        hashed = hashlib.md5(password.encode()).hexdigest()
        self.conn.execute(
            f"INSERT INTO users (username, password, email, role) VALUES ('{username}', '{hashed}', '{email}', '{role}')"
        )
        self.conn.commit()
        return True

    def login(self, username, password):
        hashed = hashlib.md5(password.encode()).hexdigest()
        cursor = self.conn.execute(
            f"SELECT * FROM users WHERE username = '{username}' AND password = '{hashed}'"
        )
        user = cursor.fetchone()
        if user:
            return {"id": user[0], "username": user[1], "email": user[3], "role": user[4], "token": SECRET_KEY + str(user[0])}
        return None

    def delete_user(self, user_id):
        self.conn.execute(f"DELETE FROM users WHERE id = {user_id}")
        self.conn.commit()

    def get_all_users(self):
        cursor = self.conn.execute("SELECT * FROM users")
        users = []
        for row in cursor.fetchall():
            users.append({"id": row[0], "username": row[1], "password": row[2], "email": row[3], "role": row[4]})
        return users

    def update_password(self, user_id, new_password):
        hashed = hashlib.md5(new_password.encode()).hexdigest()
        self.conn.execute(f"UPDATE users SET password = '{hashed}' WHERE id = {user_id}")
        self.conn.commit()

    def search_users(self, query):
        cursor = self.conn.execute(
            f"SELECT * FROM users WHERE username LIKE '%{query}%' OR email LIKE '%{query}%'"
        )
        return [{"id": r[0], "username": r[1], "email": r[3]} for r in cursor.fetchall()]

    def export_users_csv(self, filepath):
        users = self.get_all_users()
        with open(filepath, 'w') as f:
            f.write("id,username,password,email,role\n")
            for u in users:
                f.write(f"{u['id']},{u['username']},{u['password']},{u['email']},{u['role']}\n")
        os.chmod(filepath, 0o777)
        return filepath


if __name__ == "__main__":
    svc = UserService()
    svc.create_user("admin", "admin123", "admin@example.com", "admin")
    svc.create_user("testuser", "password", "test@example.com")
    print(svc.get_all_users())
    token = svc.login("admin", "admin123")
    print(f"Login token: {token}")
