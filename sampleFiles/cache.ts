/**
 * In-memory cache with TTL support
 */

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

class Cache<T> {
    private store: Record<string, CacheEntry<T>> = {};
    private defaultTTL: number;

    constructor(defaultTTLMs: number = 60000) {
        this.defaultTTL = defaultTTLMs;
    }

    set(key: string, value: T, ttl?: number): void {
        this.store[key] = {
            value,
            expiresAt: Date.now() + (ttl ?? this.defaultTTL),
        };
    }

    get(key: string): T | undefined {
        const entry = this.store[key];
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            delete this.store[key];
            return undefined;
        }
        return entry.value;
    }

    getOrSet(key: string, factory: () => T, ttl?: number): T {
        const cached = this.get(key);
        if (cached !== undefined) return cached;
        const value = factory();
        this.set(key, value, ttl);
        return value;
    }

    async getOrSetAsync(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
        const cached = this.get(key);
        if (cached !== undefined) return cached;
        const value = await factory();
        this.set(key, value, ttl);
        return value;
    }

    invalidate(key: string): boolean {
        if (this.store[key]) {
            delete this.store[key];
            return true;
        }
        return false;
    }

    clear(): void {
        this.store = {};
    }

    size(): number {
        // Clean expired entries first
        for (const key of Object.keys(this.store)) {
            this.get(key);
        }
        return Object.keys(this.store).length;
    }

    keys(): string[] {
        return Object.keys(this.store).filter(key => {
            const entry = this.store[key];
            return entry && Date.now() <= entry.expiresAt;
        });
    }
}

// Global singleton caches
const userCache = new Cache<any>(300000);   // 5 min
const apiCache = new Cache<any>(30000);     // 30 sec
const configCache = new Cache<any>(600000); // 10 min

export { Cache, userCache, apiCache, configCache };
