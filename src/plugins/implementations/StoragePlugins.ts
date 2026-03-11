import { BaseStoragePlugin } from '../core/PluginSystem'

// ─── Redis Storage Plugin ────────────────────────────────────────────────────

export class RedisStoragePlugin extends BaseStoragePlugin {
  readonly id = 'storage-redis'
  readonly name = 'Redis Storage'
  readonly version = '1.3.0'

  private client: any
  private prefix!: string
  private defaultTtl!: number

  protected async onInitialize(): Promise<void> {
    const host = this.context.config.get<string>('redis.host', 'localhost')
    const port = this.context.config.get<number>('redis.port', 6379)
    this.prefix = this.context.config.get<string>('redis.prefix', 'app:')
    this.defaultTtl = this.context.config.get<number>('redis.defaultTtlSeconds', 3600)

    this.log('info', `Connecting to Redis at ${host}:${port}`)
    // In production: this.client = new Redis({ host, port })
    this.client = new Map() // In-memory stub
  }

  protected async onDispose(): Promise<void> {
    if (this.client?.disconnect) {
      await this.client.disconnect()
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.client.get(`${this.prefix}${key}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as T
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value)
    this.client.set(`${this.prefix}${key}`, serialized)
    // In production: SET with EX for TTL
    void (ttl ?? this.defaultTtl)
  }

  async delete(key: string): Promise<boolean> {
    return this.client.delete(`${this.prefix}${key}`)
  }

  async clear(): Promise<void> {
    // In production: SCAN and DEL with prefix
    this.client.clear()
  }
}

// ─── In-Memory Storage Plugin (for testing/dev) ──────────────────────────────

export class InMemoryStoragePlugin extends BaseStoragePlugin {
  readonly id = 'storage-memory'
  readonly name = 'In-Memory Storage'
  readonly version = '1.0.0'

  private store = new Map<string, { value: string; expiresAt?: number }>()

  protected async onInitialize(): Promise<void> {
    this.log('info', 'In-memory storage initialized')
  }

  protected async onDispose(): Promise<void> {
    this.store.clear()
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key)
    if (!entry) return null

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return JSON.parse(entry.value) as T
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
    })
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }
}
