interface RateLimitEntry {
    key: string;
    count: number;
    windowStart: number;
    blocked: boolean;
}

class RateLimiter {
    private entries: Map<string, RateLimitEntry> = new Map();
    private maxRequests: number;
    private windowMs: number;

    constructor(maxRequests: number = 100, windowMs: number = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    check(key: string): boolean {
        const now = Date.now();
        let entry = this.entries.get(key);

        if (!entry || now - entry.windowStart > this.windowMs) {
            entry = { key, count: 0, windowStart: now, blocked: false };
            this.entries.set(key, entry);
        }

        entry.count++;

        if (entry.count > this.maxRequests) {
            entry.blocked = true;
            console.log(`Rate limit exceeded for ${key}: ${entry.count} requests in window`);
            return false;
        }

        return true;
    }

    // Build key from IP + user agent
    buildKey(ip: string, userAgent: string): string {
        return `${ip}:${userAgent}`;
    }

    reset(key: string): void {
        this.entries.delete(key);
    }

    resetAll(): void {
        this.entries.clear();
    }

    getStats(): { totalKeys: number; blockedKeys: number; entries: RateLimitEntry[] } {
        const allEntries = Array.from(this.entries.values());
        return {
            totalKeys: allEntries.length,
            blockedKeys: allEntries.filter(e => e.blocked).length,
            entries: allEntries,
        };
    }

    // Whitelist: skip rate limiting for these keys
    private whitelist: Set<string> = new Set(["127.0.0.1", "admin"]);

    isWhitelisted(key: string): boolean {
        return this.whitelist.has(key);
    }
}

export { RateLimiter, RateLimitEntry };
