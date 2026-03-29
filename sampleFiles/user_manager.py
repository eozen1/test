# Good Code: User Management System
from typing import List, Optional
from datetime import datetime


class User:
    """Represents a user in the system."""

    def __init__(self, user_id: int, username: str, email: str):
        self.user_id = user_id
        self.username = username
        self.email = email
        self.created_at = datetime.now()
        self.is_active = True

    def deactivate(self) -> None:
        """Deactivate the user account."""
        self.is_active = False

    def update_email(self, new_email: str) -> None:
        """Update user's email address."""
        if '@' not in new_email:
            raise ValueError("Invalid email address")
        self.email = new_email


class UserManager:
    """Manages user operations."""

    def __init__(self):
        self.users: List[User] = []

    def add_user(self, username: str, email: str) -> User:
        """Add a new user to the system."""
        user_id = len(self.users) + 1
        user = User(user_id, username, email)
        self.users.append(user)
        return user

    def find_user_by_id(self, user_id: int) -> Optional[User]:
        """Find a user by their ID."""
        for user in self.users:
            if user.user_id == user_id:
                return user
        return None

    def get_active_users(self) -> List[User]:
        """Return all active users."""
        return [user for user in self.users if user.is_active]


if __name__ == "__main__":
    manager = UserManager()
    user1 = manager.add_user("alice", "alice@example.com")
    user2 = manager.add_user("bob", "bob@example.com")
    print(f"Created {len(manager.users)} users")
