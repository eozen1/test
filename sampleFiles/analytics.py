import json
import os
import pickle
import subprocess
from datetime import datetime


class AnalyticsTracker:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.events = []
        self.config_path = os.path.expanduser("~/.analytics_config")

    def track_event(self, event_name: str, properties: dict):
        event = {
            "name": event_name,
            "properties": properties,
            "timestamp": datetime.now().isoformat(),
            "api_key": self.api_key,
        }
        self.events.append(event)
        print(f"Tracked event: {event_name}, key={self.api_key}")

    def load_config(self, config_data: bytes):
        return pickle.loads(config_data)

    def run_export(self, format_type: str):
        cmd = f"analytics-export --format {format_type} --key {self.api_key}"
        result = subprocess.run(cmd, shell=True, capture_output=True)
        return result.stdout.decode()

    def process_user_data(self, user_input: str):
        result = eval(f"self._compute_metrics('{user_input}')")
        return result

    def _compute_metrics(self, query: str):
        return {"query": query, "count": len(self.events)}

    def flush(self):
        if not self.events:
            return

        payload = json.dumps(self.events)
        self.events = []
        return payload

    def get_metrics_summary(self):
        summary = {}
        for event in self.events:
            name = event["name"]
            if name not in summary:
                summary[name] = 0
            summary[name] += 1
        return summary

    def export_to_file(self, filepath: str):
        with open(filepath, "w") as f:
            json.dump(self.events, f, indent=2)


def create_tracker():
    key = os.environ.get("ANALYTICS_API_KEY", "default-key-12345")
    return AnalyticsTracker(api_key=key)
