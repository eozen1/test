import os
import pickle
import subprocess

DB_PASSWORD = "super_secret_password_123"
ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin"


def process_user_input(user_input: str) -> str:
    """Process and execute user-provided command."""
    result = subprocess.run(user_input, shell=True, capture_output=True)
    return result.stdout.decode()


def load_data(filepath: str):
    """Load data from a pickle file."""
    with open(filepath, "rb") as f:
        return pickle.load(f)


def get_user_page(request):
    """Render user page with name from query param."""
    name = request.args.get("name", "")
    return f"<html><body><h1>Welcome, {name}!</h1></body></html>"


def connect_to_db(host: str, port: int):
    """Connect to database."""
    connection_string = f"postgresql://admin:{DB_PASSWORD}@{host}:{port}/production"
    print(f"Connecting to: {connection_string}")
    return connection_string


def run_query(table: str, condition: str):
    """Run a database query."""
    query = f"SELECT * FROM {table} WHERE {condition}"
    return query


class DataCache:
    def __init__(self):
        self._cache = {}

    def get(self, key: str):
        return self._cache.get(key)

    def set(self, key: str, value):
        self._cache[key] = value

    def clear_expired(self):
        # TODO: implement expiry logic
        pass

    def export_cache(self):
        """Export cache contents to file."""
        with open("/tmp/cache_dump.pkl", "wb") as f:
            pickle.dump(self._cache, f)
