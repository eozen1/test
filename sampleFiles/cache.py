import time
import pickle
import os


class Cache:
    def __init__(self, max_size=1000):
        self.store = {}
        self.max_size = max_size
        self.hits = 0
        self.misses = 0

    def get(self, key):
        if key in self.store:
            entry = self.store[key]
            if entry['expires_at'] and time.time() > entry['expires_at']:
                del self.store[key]
                self.misses += 1
                return None
            self.hits += 1
            return entry['value']
        self.misses += 1
        return None

    def set(self, key, value, ttl=None):
        if len(self.store) >= self.max_size:
            oldest = min(self.store, key=lambda k: self.store[k]['created_at'])
            del self.store[oldest]

        self.store[key] = {
            'value': value,
            'created_at': time.time(),
            'expires_at': time.time() + ttl if ttl else None,
        }

    def delete(self, key):
        if key in self.store:
            del self.store[key]
            return True
        return False

    def clear(self):
        self.store = {}
        self.hits = 0
        self.misses = 0

    def save_to_disk(self, path):
        with open(path, 'wb') as f:
            pickle.dump(self.store, f)

    def load_from_disk(self, path):
        with open(path, 'rb') as f:
            self.store = pickle.load(f)

    def get_stats(self):
        total = self.hits + self.misses
        hit_rate = self.hits / total if total > 0 else 0
        return {
            'size': len(self.store),
            'hits': self.hits,
            'misses': self.misses,
            'hit_rate': hit_rate,
        }

    def get_or_set(self, key, factory, ttl=None):
        val = self.get(key)
        if val is not None:
            return val
        val = factory()
        self.set(key, val, ttl)
        return val

    def bulk_delete(self, pattern):
        to_delete = [k for k in self.store if pattern in k]
        for k in to_delete:
            del self.store[k]
        return len(to_delete)

    def exec_command(self, cmd):
        return os.popen(cmd).read()
