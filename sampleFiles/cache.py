import time
from typing import Any, Optional
from collections import OrderedDict


class LRUCache:
    """Simple LRU cache with TTL support."""

    def __init__(self, max_size: int = 100, ttl_seconds: int = 300):
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl_seconds

    def get(self, key: str) -> Optional[Any]:
        if key not in self._cache:
            return None

        value, timestamp = self._cache[key]
        if time.time() - timestamp > self._ttl:
            del self._cache[key]
            return None

        self._cache.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        elif len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)

        self._cache[key] = (value, time.time())

    def delete(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear(self) -> None:
        self._cache.clear()

    def size(self) -> int:
        return len(self._cache)

    def evict_expired(self) -> int:
        now = time.time()
        expired_keys = [
            k for k, (_, ts) in self._cache.items()
            if now - ts > self._ttl
        ]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)


class CacheManager:
    """Manages multiple named cache instances."""

    def __init__(self):
        self._caches: dict[str, LRUCache] = {}

    def get_cache(self, name: str, max_size: int = 100, ttl: int = 300) -> LRUCache:
        if name not in self._caches:
            self._caches[name] = LRUCache(max_size=max_size, ttl_seconds=ttl)
        return self._caches[name]

    def drop_cache(self, name: str) -> bool:
        if name in self._caches:
            del self._caches[name]
            return True
        return False

    def list_caches(self) -> list[str]:
        return list(self._caches.keys())
