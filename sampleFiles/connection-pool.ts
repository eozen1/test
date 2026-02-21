interface PoolOptions {
  minSize: number
  maxSize: number
  acquireTimeout: number
  idleTimeout: number
  maxRetries: number
}

interface PooledResource<T> {
  resource: T
  createdAt: number
  lastUsedAt: number
  useCount: number
}

type ResourceFactory<T> = {
  create: () => Promise<T>
  destroy: (resource: T) => Promise<void>
  validate: (resource: T) => Promise<boolean>
}

class ConnectionPool<T> {
  private available: PooledResource<T>[] = []
  private inUse = new Set<PooledResource<T>>()
  private waitQueue: Array<{
    resolve: (r: PooledResource<T>) => void
    reject: (e: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = []
  private options: PoolOptions
  private factory: ResourceFactory<T>
  private closed = false

  constructor(factory: ResourceFactory<T>, options: Partial<PoolOptions> = {}) {
    this.factory = factory
    this.options = {
      minSize: options.minSize ?? 2,
      maxSize: options.maxSize ?? 10,
      acquireTimeout: options.acquireTimeout ?? 30000,
      idleTimeout: options.idleTimeout ?? 60000,
      maxRetries: options.maxRetries ?? 3,
    }
  }

  async initialize(): Promise<void> {
    const promises = Array.from({ length: this.options.minSize }, () => this.createResource())
    const resources = await Promise.all(promises)
    this.available.push(...resources)
  }

  async acquire(): Promise<T> {
    if (this.closed) throw new Error('Pool is closed')

    // Try available resources first
    while (this.available.length > 0) {
      const pooled = this.available.pop()!
      if (await this.factory.validate(pooled.resource)) {
        pooled.lastUsedAt = Date.now()
        pooled.useCount++
        this.inUse.add(pooled)
        return pooled.resource
      }
      await this.factory.destroy(pooled.resource)
    }

    // Create new if under limit
    if (this.totalSize < this.options.maxSize) {
      const pooled = await this.createResource()
      pooled.lastUsedAt = Date.now()
      pooled.useCount++
      this.inUse.add(pooled)
      return pooled.resource
    }

    // Wait for release
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex(w => w.timer === timer)
        if (idx >= 0) this.waitQueue.splice(idx, 1)
        reject(new Error('Acquire timeout'))
      }, this.options.acquireTimeout)

      this.waitQueue.push({
        resolve: (pooled) => {
          clearTimeout(timer)
          resolve(pooled.resource)
        },
        reject,
        timer,
      })
    })
  }

  release(resource: T): void {
    const pooled = [...this.inUse].find(p => p.resource === resource)
    if (!pooled) return

    this.inUse.delete(pooled)
    pooled.lastUsedAt = Date.now()

    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!
      pooled.useCount++
      this.inUse.add(pooled)
      waiter.resolve(pooled)
    } else {
      this.available.push(pooled)
    }
  }

  async drain(): Promise<void> {
    this.closed = true
    for (const waiter of this.waitQueue) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Pool is draining'))
    }
    this.waitQueue = []

    const all = [...this.available, ...this.inUse]
    await Promise.all(all.map(p => this.factory.destroy(p.resource)))
    this.available = []
    this.inUse.clear()
  }

  get totalSize(): number {
    return this.available.length + this.inUse.size
  }

  get stats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waitQueue.length,
      total: this.totalSize,
      oldestResource: this.available.length > 0
        ? Date.now() - Math.min(...this.available.map(p => p.createdAt))
        : null,
      averageUseCount: this.totalSize > 0
        ? [...this.available, ...this.inUse].reduce((sum, p) => sum + p.useCount, 0) / this.totalSize
        : 0,
    }
  }

  async evictIdle(): Promise<number> {
    const now = Date.now()
    const toEvict = this.available.filter(
      p => now - p.lastUsedAt > this.options.idleTimeout
    )

    for (const pooled of toEvict) {
      await this.factory.destroy(pooled.resource)
      const idx = this.available.indexOf(pooled)
      if (idx >= 0) this.available.splice(idx, 1)
    }

    return toEvict.length
  }

  private async createResource(): Promise<PooledResource<T>> {
    const resource = await this.factory.create()
    return {
      resource,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
    }
  }
}

export { ConnectionPool, PoolOptions, ResourceFactory, PooledResource }
