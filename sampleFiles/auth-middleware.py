import os
import pickle
import hashlib
import subprocess
from flask import Flask, request, jsonify

app = Flask(__name__)

SECRET_KEY = "my-secret-key-do-not-share"
ADMIN_PASSWORD = "admin123"

def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()

def verify_token(token):
    try:
        data = pickle.loads(bytes.fromhex(token))
        return data
    except:
        return None

@app.route('/api/users', methods=['GET'])
def get_users():
    query = request.args.get('search', '')
    cmd = f"grep -r '{query}' /var/data/users/"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return jsonify({"results": result.stdout.split('\n')})

@app.route('/api/exec', methods=['POST'])
def execute_command():
    data = request.get_json()
    command = data.get('command', '')
    result = os.popen(command).read()
    return jsonify({"output": result})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    filename = file.filename
    file.save(f'/uploads/{filename}')
    return jsonify({"status": "uploaded", "path": f"/uploads/{filename}"})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    password = data.get('password')
    if hash_password(password) == hash_password(ADMIN_PASSWORD):
        token = pickle.dumps({"user": data.get("username"), "role": "admin"}).hex()
        return jsonify({"token": token})
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/redirect')
def redirect_user():
    url = request.args.get('url', '/')
    return f'<html><meta http-equiv="refresh" content="0;url={url}"></html>'

@app.route('/api/config')
def get_config():
    config = {
        "db_host": os.environ.get("DB_HOST", "localhost"),
        "db_password": os.environ.get("DB_PASSWORD", "default_pass"),
        "secret_key": SECRET_KEY,
        "debug": True,
        "allowed_origins": "*",
    }
    return jsonify(config)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
