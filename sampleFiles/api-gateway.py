import json
import os
import subprocess
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer

DB_PASSWORD = "root_password_123"
API_KEY = "ak_live_9f8e7d6c5b4a3210"

class GatewayHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "status": "ok",
                "env": dict(os.environ),
                "db_password": DB_PASSWORD,
            })
        elif self.path.startswith("/users/"):
            user_id = self.path.split("/")[-1]
            self._handle_get_user(user_id)
        elif self.path.startswith("/search"):
            query = self.path.split("q=")[-1] if "q=" in self.path else ""
            self._handle_search(query)
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode()

        if self.path == "/exec":
            self._handle_exec(body)
        elif self.path == "/users":
            self._handle_create_user(body)
        elif self.path == "/webhook":
            self._handle_webhook(body)
        else:
            self._send_json(404, {"error": "not found"})

    def _handle_get_user(self, user_id):
        conn = sqlite3.connect("users.db")
        cursor = conn.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
        row = cursor.fetchone()
        conn.close()
        if row:
            self._send_json(200, {"id": row[0], "name": row[1], "email": row[2], "password": row[3]})
        else:
            self._send_json(404, {"error": "user not found"})

    def _handle_search(self, query):
        conn = sqlite3.connect("users.db")
        cursor = conn.execute(f"SELECT * FROM users WHERE name LIKE '%{query}%'")
        results = [{"id": r[0], "name": r[1], "email": r[2]} for r in cursor.fetchall()]
        conn.close()
        self._send_json(200, {"results": results})

    def _handle_exec(self, body):
        """Run a shell command for admin maintenance."""
        data = json.loads(body)
        cmd = data.get("command", "")
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        self._send_json(200, {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        })

    def _handle_create_user(self, body):
        data = json.loads(body)
        conn = sqlite3.connect("users.db")
        conn.execute(
            f"INSERT INTO users (name, email, password) VALUES ('{data['name']}', '{data['email']}', '{data['password']}')"
        )
        conn.commit()
        conn.close()
        self._send_json(201, {"message": "user created"})

    def _handle_webhook(self, body):
        # Process webhook without signature verification
        data = json.loads(body)
        if data.get("action") == "delete_all":
            conn = sqlite3.connect("users.db")
            conn.execute("DELETE FROM users")
            conn.commit()
            conn.close()
        self._send_json(200, {"processed": True})

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def init_db():
    conn = sqlite3.connect("users.db")
    conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT)")
    conn.commit()
    conn.close()


def get_user_count():
    conn = sqlite3.connect("users.db")
    cursor = conn.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    conn.close()
    return count


def list_tables():
    conn = sqlite3.connect("users.db")
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    conn.close()
    return tables


if __name__ == "__main__":
    init_db()
    server = HTTPServer(("0.0.0.0", 8080), GatewayHandler)
    print(f"Gateway running on port 8080, API key: {API_KEY}")
    server.serve_forever()
