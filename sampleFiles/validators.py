import re
from typing import Any, Dict, List, Optional, Tuple


class ValidationError(Exception):
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class ValidationResult:
    def __init__(self):
        self.errors: List[ValidationError] = []
        self.warnings: List[str] = []

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    def add_error(self, field: str, message: str):
        self.errors.append(ValidationError(field, message))

    def add_warning(self, message: str):
        self.warnings.append(message)

    def to_dict(self) -> Dict:
        return {
            "valid": self.is_valid,
            "errors": [{"field": e.field, "message": e.message} for e in self.errors],
            "warnings": self.warnings,
        }


def validate_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email))


def validate_password(password: str) -> Tuple[bool, List[str]]:
    issues = []
    if len(password) < 8:
        issues.append("Password must be at least 8 characters")
    if not any(c.isupper() for c in password):
        issues.append("Must contain uppercase letter")
    if not any(c.islower() for c in password):
        issues.append("Must contain lowercase letter")
    if not any(c.isdigit() for c in password):
        issues.append("Must contain a digit")
    return len(issues) == 0, issues


def validate_url(url: str) -> bool:
    pattern = r"^https?://[^\s/$.?#].[^\s]*$"
    return bool(re.match(pattern, url))


def validate_phone(phone: str) -> bool:
    cleaned = re.sub(r"[\s\-\(\)\+]", "", phone)
    return cleaned.isdigit() and 7 <= len(cleaned) <= 15


class SchemaValidator:
    def __init__(self, schema: Dict[str, Dict]):
        self.schema = schema

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        result = ValidationResult()

        for field_name, rules in self.schema.items():
            value = data.get(field_name)

            if rules.get("required") and value is None:
                result.add_error(field_name, "Field is required")
                continue

            if value is None:
                continue

            expected_type = rules.get("type")
            if expected_type and not isinstance(value, expected_type):
                result.add_error(field_name, f"Expected {expected_type.__name__}")

            min_len = rules.get("min_length")
            if min_len and isinstance(value, str) and len(value) < min_len:
                result.add_error(field_name, f"Minimum length is {min_len}")

            max_len = rules.get("max_length")
            if max_len and isinstance(value, str) and len(value) > max_len:
                result.add_error(field_name, f"Maximum length is {max_len}")

            min_val = rules.get("min")
            if min_val is not None and isinstance(value, (int, float)) and value < min_val:
                result.add_error(field_name, f"Minimum value is {min_val}")

            max_val = rules.get("max")
            if max_val is not None and isinstance(value, (int, float)) and value > max_val:
                result.add_error(field_name, f"Maximum value is {max_val}")

            pattern = rules.get("pattern")
            if pattern and isinstance(value, str) and not re.match(pattern, value):
                result.add_error(field_name, "Invalid format")

            custom = rules.get("validator")
            if custom and callable(custom):
                try:
                    if not custom(value):
                        result.add_error(field_name, "Custom validation failed")
                except:
                    result.add_error(field_name, "Validation error")

        # Warn about extra fields
        for key in data:
            if key not in self.schema:
                result.add_warning(f"Unknown field: {key}")

        return result


def sanitize_input(value: str) -> str:
    value = value.strip()
    value = re.sub(r"<[^>]+>", "", value)
    value = value.replace("&", "&amp;")
    value = value.replace('"', "&quot;")
    return value
