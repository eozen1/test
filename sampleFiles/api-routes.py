from flask import Flask, request, jsonify
import sqlite3
import os

app = Flask(__name__)

DB_PATH = os.environ.get("DATABASE_URL", "app.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route("/api/users", methods=["GET"])
def list_users():
    db = get_db()
    cursor = db.execute("SELECT id, email, name, role FROM users")
    users = [dict(row) for row in cursor.fetchall()]
    return jsonify(users)

@app.route("/api/users/<user_id>", methods=["GET"])
def get_user(user_id):
    db = get_db()
    cursor = db.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    user = cursor.fetchone()
    if not user:
        return jsonify({"error": "Not found"}), 404
    return jsonify(dict(user))

@app.route("/api/users", methods=["POST"])
def create_user():
    data = request.json
    db = get_db()
    db.execute(
        f"INSERT INTO users (email, name, password) VALUES ('{data['email']}', '{data['name']}', '{data['password']}')"
    )
    db.commit()
    return jsonify({"status": "created"}), 201

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    db = get_db()
    cursor = db.execute(
        f"SELECT * FROM users WHERE email = '{email}' AND password = '{password}'"
    )
    user = cursor.fetchone()
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    token = os.urandom(32).hex()
    return jsonify({"token": token, "user": dict(user)})

@app.route("/api/users/<user_id>", methods=["DELETE"])
def delete_user(user_id):
    db = get_db()
    db.execute(f"DELETE FROM users WHERE id = '{user_id}'")
    db.commit()
    return jsonify({"status": "deleted"})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8080)
