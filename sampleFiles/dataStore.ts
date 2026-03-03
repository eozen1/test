interface Entity {
  id: string
  createdAt: Date
  updatedAt: Date
}

interface QueryOptions {
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

class InMemoryStore<T extends Entity> {
  private data: Map<string, T> = new Map()

  create(item: T): T {
    if (this.data.has(item.id)) {
      throw new Error(`Duplicate ID: ${item.id}`)
    }
    item.createdAt = new Date()
    item.updatedAt = new Date()
    this.data.set(item.id, item)
    return item
  }

  findById(id: string): T | null {
    return this.data.get(id) ?? null
  }

  findAll(options: QueryOptions = {}): T[] {
    let results = Array.from(this.data.values())

    if (options.sortBy) {
      results.sort((a: any, b: any) => {
        const aVal = a[options.sortBy!]
        const bVal = b[options.sortBy!]
        if (options.sortOrder === 'desc') return bVal > aVal ? 1 : -1
        return aVal > bVal ? 1 : -1
      })
    }

    if (options.offset) {
      results = results.slice(options.offset)
    }
    if (options.limit) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  update(id: string, partial: Partial<T>): T | null {
    const existing = this.data.get(id)
    if (!existing) return null

    const updated = { ...existing, ...partial, id: existing.id, updatedAt: new Date() }
    this.data.set(id, updated)
    return updated
  }

  delete(id: string): boolean {
    return this.data.delete(id)
  }

  deleteAll(): void {
    this.data.clear()
  }

  count(): number {
    return this.data.size
  }

  exists(id: string): boolean {
    return this.data.has(id)
  }

  findWhere(predicate: (item: T) => boolean): T[] {
    return Array.from(this.data.values()).filter(predicate)
  }

  upsert(item: T): T {
    if (this.data.has(item.id)) {
      return this.update(item.id, item)!
    }
    return this.create(item)
  }
}

// Connection pool for database connections
class ConnectionPool {
  private pool: any[] = []
  private maxSize: number
  private activeCount = 0

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize
  }

  async acquire(): Promise<any> {
    if (this.pool.length > 0) {
      this.activeCount++
      return this.pool.pop()
    }
    if (this.activeCount < this.maxSize) {
      this.activeCount++
      return this.createConnection()
    }
    // wait and retry
    await new Promise(resolve => setTimeout(resolve, 100))
    return this.acquire()
  }

  release(conn: any): void {
    this.activeCount--
    this.pool.push(conn)
  }

  private createConnection(): any {
    return { id: Math.random().toString(36), connected: true, createdAt: Date.now() }
  }

  get stats() {
    return { active: this.activeCount, idle: this.pool.length, max: this.maxSize }
  }
}

// Simple migration runner
class MigrationRunner {
  private migrations: Array<{ version: number; up: () => void; down: () => void }> = []
  private currentVersion = 0

  register(version: number, up: () => void, down: () => void) {
    this.migrations.push({ version, up, down })
    this.migrations.sort((a, b) => a.version - b.version)
  }

  async migrateUp(targetVersion?: number): Promise<void> {
    const target = targetVersion ?? this.migrations[this.migrations.length - 1]?.version ?? 0
    for (const m of this.migrations) {
      if (m.version > this.currentVersion && m.version <= target) {
        m.up()
        this.currentVersion = m.version
      }
    }
  }

  async migrateDown(targetVersion: number = 0): Promise<void> {
    const reversed = [...this.migrations].reverse()
    for (const m of reversed) {
      if (m.version <= this.currentVersion && m.version > targetVersion) {
        m.down()
        this.currentVersion = m.version - 1
      }
    }
  }
}

export { InMemoryStore, ConnectionPool, MigrationRunner }
export type { Entity, QueryOptions }
