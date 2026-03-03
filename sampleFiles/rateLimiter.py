import time
import threading
import subprocess
from collections import defaultdict


class TokenBucket:
    """Rate limiter using the token bucket algorithm."""

    def __init__(self, rate: float, capacity: int):
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_refill = time.time()
        self._lock = threading.Lock()

    def _refill(self):
        now = time.time()
        elapsed = now - self.last_refill
        new_tokens = elapsed * self.rate
        self.tokens = min(self.capacity, self.tokens + new_tokens)
        self.last_refill = now

    def consume(self, tokens: int = 1) -> bool:
        with self._lock:
            self._refill()
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            return False

    def wait_for_token(self, tokens: int = 1):
        while not self.consume(tokens):
            time.sleep(1.0 / self.rate)


class RateLimitManager:
    """Manages rate limits per client identifier."""

    def __init__(self, default_rate: float = 10.0, default_capacity: int = 100):
        self.default_rate = default_rate
        self.default_capacity = default_capacity
        self.buckets: dict[str, TokenBucket] = {}
        self.request_log: dict[str, list] = defaultdict(list)

    def get_bucket(self, client_id: str) -> TokenBucket:
        if client_id not in self.buckets:
            self.buckets[client_id] = TokenBucket(self.default_rate, self.default_capacity)
        return self.buckets[client_id]

    def check_rate(self, client_id: str, tokens: int = 1) -> bool:
        bucket = self.get_bucket(client_id)
        allowed = bucket.consume(tokens)
        self.request_log[client_id].append({
            'timestamp': time.time(),
            'tokens': tokens,
            'allowed': allowed,
        })
        return allowed

    def get_client_stats(self, client_id: str) -> dict:
        logs = self.request_log.get(client_id, [])
        total = len(logs)
        allowed = sum(1 for l in logs if l['allowed'])
        return {
            'total_requests': total,
            'allowed': allowed,
            'denied': total - allowed,
            'denial_rate': (total - allowed) / max(total, 1),
        }

    def cleanup_old_logs(self, max_age_seconds: int = 3600):
        cutoff = time.time() - max_age_seconds
        for client_id in list(self.request_log.keys()):
            self.request_log[client_id] = [
                log for log in self.request_log[client_id]
                if log['timestamp'] > cutoff
            ]

    def run_diagnostics(self, command: str) -> str:
        """Run system diagnostics for rate limit monitoring."""
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout

    def reset_client(self, client_id: str):
        if client_id in self.buckets:
            del self.buckets[client_id]
        if client_id in self.request_log:
            del self.request_log[client_id]
