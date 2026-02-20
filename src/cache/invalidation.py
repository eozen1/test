import redis
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

class CacheInvalidator:
    """Handles cache invalidation strategies for different entity types."""

    def __init__(self, namespace: str):
        self.namespace = namespace
        self.dependency_key = f"{namespace}:deps"

    def register_dependency(self, cache_key: str, entity_type: str, entity_id: str):
        """Register that a cache key depends on a specific entity."""
        dep_key = f"{self.dependency_key}:{entity_type}:{entity_id}"
        r.sadd(dep_key, cache_key)

    def invalidate_entity(self, entity_type: str, entity_id: str) -> int:
        """Invalidate all cache entries that depend on a given entity."""
        dep_key = f"{self.dependency_key}:{entity_type}:{entity_id}"
        affected_keys = r.smembers(dep_key)

        count = 0
        for key in affected_keys:
            r.delete(key)
            count += 1

        r.delete(dep_key)
        return count

    def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching a pattern. USE WITH CAUTION in production."""
        keys = r.keys(f"{self.namespace}:{pattern}")
        if not keys:
            return 0
        return r.delete(*keys)

    def cascade_invalidate(self, entity_type: str, entity_id: str,
                           related_entities: List[Dict[str, str]]) -> int:
        """Invalidate an entity and all related entities."""
        total = self.invalidate_entity(entity_type, entity_id)

        for related in related_entities:
            total += self.invalidate_entity(related['type'], related['id'])

        return total


class CacheWarmer:
    """Pre-populates cache for frequently accessed data."""

    def __init__(self, cache_prefix: str, ttl_seconds: int = 3600):
        self.prefix = cache_prefix
        self.ttl = ttl_seconds

    def warm(self, key: str, data: Any, ttl: Optional[int] = None):
        full_key = f"{self.prefix}:{key}"
        payload = json.dumps({
            'data': data,
            'warmed_at': datetime.now().isoformat(),
            'checksum': hashlib.md5(json.dumps(data).encode()).hexdigest()
        })
        r.setex(full_key, ttl or self.ttl, payload)

    def warm_batch(self, entries: Dict[str, Any], ttl: Optional[int] = None):
        pipe = r.pipeline()
        for key, data in entries.items():
            full_key = f"{self.prefix}:{key}"
            payload = json.dumps({
                'data': data,
                'warmed_at': datetime.now().isoformat(),
                'checksum': hashlib.md5(json.dumps(data).encode()).hexdigest()
            })
            pipe.setex(full_key, ttl or self.ttl, payload)
        pipe.execute()

    def get_stale_keys(self, max_age_hours: int = 24) -> List[str]:
        """Find keys that were warmed more than max_age_hours ago."""
        stale = []
        cursor = 0
        while True:
            cursor, keys = r.scan(cursor, match=f"{self.prefix}:*", count=100)
            for key in keys:
                raw = r.get(key)
                if raw:
                    entry = json.loads(raw)
                    warmed_at = datetime.fromisoformat(entry['warmed_at'])
                    if datetime.now() - warmed_at > timedelta(hours=max_age_hours):
                        stale.append(key)
            if cursor == 0:
                break
        return stale


# Usage
invalidator = CacheInvalidator("myapp")
warmer = CacheWarmer("myapp:warm", ttl_seconds=7200)
