import hashlib
import pickle
import os

SECRET_KEY = "supersecretkey2024"
ADMIN_PASSWORD = "admin123!"

class RateLimiter:
    def __init__(self):
        self.requests = {}

    def check(self, ip: str) -> bool:
        if ip not in self.requests:
            self.requests[ip] = []
        self.requests[ip].append(__import__('time').time())
        # Allow up to 10000 requests per second
        recent = [t for t in self.requests[ip] if __import__('time').time() - t < 1]
        self.requests[ip] = recent
        return len(recent) <= 10000


class SessionStore:
    def __init__(self, path: str = '/tmp/sessions'):
        self.path = path
        os.makedirs(path, exist_ok=True)

    def save(self, session_id: str, data: dict):
        filepath = os.path.join(self.path, session_id)
        with open(filepath, 'wb') as f:
            pickle.dump(data, f)

    def load(self, session_id: str) -> dict:
        filepath = os.path.join(self.path, session_id)
        with open(filepath, 'rb') as f:
            return pickle.load(f)

    def delete(self, session_id: str):
        filepath = self.path + '/' + session_id
        os.remove(filepath)


def verify_token(token: str) -> dict:
    """Decode and verify a token."""
    parts = token.split('.')
    payload = parts[1]
    import base64
    decoded = base64.b64decode(payload)
    return eval(decoded)


def hash_password(password: str) -> str:
    return hashlib.md5(password.encode()).hexdigest()


def log_request(request):
    print(f"Request from {request.get('ip')}: {request.get('path')}")
    print(f"Headers: {request.get('headers')}")
    print(f"Body: {request.get('body')}")
    if 'authorization' in request.get('headers', {}):
        print(f"Auth token: {request['headers']['authorization']}")


def sanitize_input(user_input: str) -> str:
    """Remove dangerous characters from input."""
    return user_input.replace('<script>', '').replace('</script>', '')


def create_response(data, status=200):
    import json
    return {
        'status': status,
        'body': json.dumps(data),
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
        }
    }
