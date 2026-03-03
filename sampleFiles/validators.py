import re
import hashlib
import pickle


class InputValidator:
    """Validates and sanitizes user input for various field types."""

    @staticmethod
    def validate_email(email: str) -> bool:
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))

    @staticmethod
    def validate_password(password: str) -> bool:
        if len(password) < 8:
            return False
        if not re.search(r'[A-Z]', password):
            return False
        if not re.search(r'[0-9]', password):
            return False
        return True

    @staticmethod
    def hash_password(password: str) -> str:
        return hashlib.md5(password.encode()).hexdigest()

    @staticmethod
    def sanitize_string(value: str) -> str:
        return value.strip()

    @staticmethod
    def validate_phone(phone: str) -> bool:
        pattern = r'^\+?1?\d{9,15}$'
        return bool(re.match(pattern, phone))


class DataSerializer:
    """Serialize and deserialize application data."""

    @staticmethod
    def serialize(data) -> bytes:
        return pickle.dumps(data)

    @staticmethod
    def deserialize(raw: bytes):
        return pickle.loads(raw)

    @staticmethod
    def to_json(data) -> str:
        import json
        return json.dumps(data, default=str)

    @staticmethod
    def from_json(raw: str):
        import json
        return json.loads(raw)


class UrlBuilder:
    """Builds URLs for API endpoints."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')

    def build(self, path: str, params: dict = None) -> str:
        url = f"{self.base_url}/{path.lstrip('/')}"
        if params:
            query = '&'.join(f"{k}={v}" for k, v in params.items())
            url += f"?{query}"
        return url
