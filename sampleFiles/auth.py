import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional


class AuthenticationError(Exception):
    pass


class TokenExpiredError(AuthenticationError):
    pass


class Session:
    def __init__(self, user_id: str, token: str, expires_at: datetime):
        self.user_id = user_id
        self.token = token
        self.expires_at = expires_at
        self.created_at = datetime.utcnow()

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at


class AuthService:
    def __init__(self, session_ttl_hours: int = 24):
        self._sessions: dict[str, Session] = {}
        self._password_hashes: dict[str, str] = {}
        self._session_ttl = timedelta(hours=session_ttl_hours)

    def register(self, user_id: str, password: str) -> None:
        if user_id in self._password_hashes:
            raise AuthenticationError(f"User {user_id} already registered")
        self._password_hashes[user_id] = self._hash_password(password)

    def login(self, user_id: str, password: str) -> str:
        stored_hash = self._password_hashes.get(user_id)
        if not stored_hash:
            raise AuthenticationError("Invalid credentials")

        if stored_hash != self._hash_password(password):
            raise AuthenticationError("Invalid credentials")

        token = secrets.token_urlsafe(32)
        session = Session(
            user_id=user_id,
            token=token,
            expires_at=datetime.utcnow() + self._session_ttl,
        )
        self._sessions[token] = session
        return token

    def validate_token(self, token: str) -> str:
        session = self._sessions.get(token)
        if not session:
            raise AuthenticationError("Invalid token")
        if session.is_expired:
            del self._sessions[token]
            raise TokenExpiredError("Session expired")
        return session.user_id

    def logout(self, token: str) -> None:
        self._sessions.pop(token, None)

    def cleanup_expired_sessions(self) -> int:
        expired = [
            token for token, session in self._sessions.items()
            if session.is_expired
        ]
        for token in expired:
            del self._sessions[token]
        return len(expired)

    def _hash_password(self, password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()
