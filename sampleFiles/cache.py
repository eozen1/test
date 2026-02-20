import time
import threading
from collections import OrderedDict


class LRUCache:
    """Thread-safe LRU cache with TTL support."""

    def __init__(self, max_size=128, default_ttl=None):
        self._cache = OrderedDict()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key, default=None):
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return default

            value, expires_at = self._cache[key]

            if expires_at and time.time() > expires_at:
                del self._cache[key]
                self._misses += 1
                return default

            self._cache.move_to_end(key)
            self._hits += 1
            return value

    def set(self, key, value, ttl=None):
        effective_ttl = ttl if ttl is not None else self._default_ttl
        expires_at = time.time() + effective_ttl if effective_ttl else None

        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            elif len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)

            self._cache[key] = (value, expires_at)

    def delete(self, key):
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self):
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0

    def size(self):
        return len(self._cache)

    @property
    def hit_rate(self):
        total = self._hits + self._misses
        if total == 0:
            return 0.0
        return self._hits / total

    def evict_expired(self):
        now = time.time()
        with self._lock:
            expired_keys = [
                k for k, (_, expires_at) in self._cache.items()
                if expires_at and now > expires_at
            ]
            for k in expired_keys:
                del self._cache[k]
            return len(expired_keys)


# Decorator for memoizing function results
def cached(cache, ttl=None):
    def decorator(func):
        def wrapper(*args, **kwargs):
            key = (func.__name__, args, tuple(sorted(kwargs.items())))
            result = cache.get(key)
            if result is not None:
                return result
            result = func(*args, **kwargs)
            cache.set(key, result, ttl=ttl)
            return result
        wrapper.__wrapped__ = func
        return wrapper
    return decorator


cache = LRUCache(max_size=256, default_ttl=300)

@cached(cache, ttl=60)
def expensive_computation(n):
    time.sleep(0.1)  # simulate work
    return sum(i * i for i in range(n))
