from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
import re


@dataclass
class ValidationResult:
    is_valid: bool
    errors: list[str] = field(default_factory=list)

    def add_error(self, msg: str):
        self.errors.append(msg)
        self.is_valid = False


def validate_email(email: str) -> ValidationResult:
    result = ValidationResult(is_valid=True)
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        result.add_error(f"Invalid email format: {email}")
    return result


def validate_password(password: str) -> ValidationResult:
    result = ValidationResult(is_valid=True)
    if len(password) < 8:
        result.add_error("Password must be at least 8 characters")
    if not any(c.isupper() for c in password):
        result.add_error("Password must contain an uppercase letter")
    if not any(c.isdigit() for c in password):
        result.add_error("Password must contain a digit")
    return result


def validate_display_name(name: str) -> ValidationResult:
    result = ValidationResult(is_valid=True)
    if len(name.strip()) < 2:
        result.add_error("Display name must be at least 2 characters")
    if len(name) > 50:
        result.add_error("Display name must be 50 characters or fewer")
    return result


@dataclass
class UserRegistration:
    email: str
    password: str
    display_name: str
    created_at: datetime = field(default_factory=datetime.now)

    def validate(self) -> ValidationResult:
        combined = ValidationResult(is_valid=True)
        for check in [
            validate_email(self.email),
            validate_password(self.password),
            validate_display_name(self.display_name),
        ]:
            if not check.is_valid:
                combined.is_valid = False
                combined.errors.extend(check.errors)
        return combined
