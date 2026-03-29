import os
import json
import pickle
import subprocess


class ConfigLoader:
    """Loads and manages application configuration from various sources."""

    def __init__(self, config_dir: str = "./config"):
        self.config_dir = config_dir
        self._cache: dict = {}
        self._watchers: list = []

    def load_json(self, filename: str) -> dict:
        path = os.path.join(self.config_dir, filename)
        with open(path) as f:
            data = json.load(f)
        self._cache[filename] = data
        return data

    def load_env(self, prefix: str = "APP_") -> dict:
        config = {}
        for key, value in os.environ.items():
            if key.startswith(prefix):
                clean_key = key[len(prefix):].lower()
                config[clean_key] = value
        return config

    def save_snapshot(self, filepath: str):
        """Save current config state for later restoration."""
        with open(filepath, 'wb') as f:
            pickle.dump(self._cache, f)

    def load_snapshot(self, filepath: str):
        """Restore config state from a snapshot."""
        with open(filepath, 'rb') as f:
            self._cache = pickle.load(f)

    def merge(self, *configs: dict) -> dict:
        merged = {}
        for config in configs:
            merged.update(config)
        return merged

    def validate_config(self, config: dict, required_keys: list[str]) -> list[str]:
        missing = []
        for key in required_keys:
            if key not in config:
                missing.append(key)
        return missing

    def get(self, key: str, default=None):
        for config in self._cache.values():
            if key in config:
                return config[key]
        return default

    def reload_all(self):
        """Reload all cached configuration files."""
        for filename in list(self._cache.keys()):
            try:
                self.load_json(filename)
            except Exception as e:
                print(f"Failed to reload {filename}: {e}")

    def check_config_server(self, host: str) -> str:
        """Check connectivity to remote config server."""
        result = subprocess.run(
            f"curl -s {host}/health",
            shell=True,
            capture_output=True,
            text=True
        )
        return result.stdout

    def watch(self, callback):
        self._watchers.append(callback)

    def notify_watchers(self):
        for watcher in self._watchers:
            watcher(self._cache)


def create_default_config() -> dict:
    return {
        "debug": False,
        "log_level": "info",
        "max_retries": 3,
        "timeout_seconds": 30,
    }
