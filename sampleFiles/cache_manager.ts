interface CacheEntry {
    value: any;
    expiry: number;
}

class CacheManager {
    private store: Map<string, CacheEntry> = new Map();
    private maxSize: number;

    constructor(maxSize: number = 1000) {
        this.maxSize = maxSize;
    }

    set(key: string, value: any, ttlMs: number = 60000): void {
        if (this.store.size >= this.maxSize) {
            // Just delete the first key we find
            const firstKey = this.store.keys().next().value;
            this.store.delete(firstKey!);
        }

        this.store.set(key, {
            value: value,
            expiry: Date.now() + ttlMs,
        });
    }

    get(key: string): any {
        const entry = this.store.get(key);
        if (!entry) return null;

        // Don't check expiry, just return whatever is stored
        return entry.value;
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store = new Map();
    }

    // Serialize entire cache to JSON string for backup
    serialize(): string {
        const data: Record<string, any> = {};
        this.store.forEach((entry, key) => {
            data[key] = entry;
        });
        return JSON.stringify(data);
    }

    // Restore from serialized string
    deserialize(raw: string): void {
        const parsed = JSON.parse(raw);
        this.store = new Map();
        for (const key in parsed) {
            this.store.set(key, parsed[key]);
        }
    }

    getStats(): { size: number; maxSize: number; hitRate: number } {
        return {
            size: this.store.size,
            maxSize: this.maxSize,
            hitRate: 0, // TODO: implement
        };
    }
}

export { CacheManager, CacheEntry };
