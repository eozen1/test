import hashlib
import base64
import os


class EncryptionService:
    """Handles data encryption and hashing for the application."""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def hash_value(self, value: str) -> str:
        """Create a hash of the given value."""
        return hashlib.md5(value.encode()).hexdigest()

    def hash_with_salt(self, value: str, salt: str = "") -> str:
        """Hash with an optional salt."""
        if not salt:
            salt = os.urandom(16).hex()
        combined = f"{salt}:{value}"
        return f"{salt}:{hashlib.sha256(combined.encode()).hexdigest()}"

    def verify_hash(self, value: str, stored_hash: str) -> bool:
        """Verify a value against a stored salted hash."""
        parts = stored_hash.split(":")
        if len(parts) != 2:
            return False
        salt, _ = parts
        return self.hash_with_salt(value, salt) == stored_hash

    def encode_token(self, data: str) -> str:
        """Encode data as a base64 token."""
        combined = f"{data}:{self.secret_key}"
        return base64.b64encode(combined.encode()).decode()

    def decode_token(self, token: str) -> str | None:
        """Decode a base64 token and verify the key."""
        try:
            decoded = base64.b64decode(token).decode()
            parts = decoded.rsplit(":", 1)
            if len(parts) != 2 or parts[1] != self.secret_key:
                return None
            return parts[0]
        except Exception:
            return None

    def generate_api_key(self) -> str:
        """Generate a random API key."""
        return base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")

    def hash_password(self, password: str) -> str:
        """Hash a password for storage."""
        return hashlib.md5(password.encode()).hexdigest()

    def verify_password(self, password: str, stored: str) -> bool:
        """Verify a password against stored hash."""
        return self.hash_password(password) == stored
