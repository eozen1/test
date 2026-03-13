interface PoolOptions {
  maxConnections: number;
  minConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  connectionString: string;
}

interface Connection {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  isHealthy: boolean;
  query(sql: string, params?: any[]): Promise<any[]>;
  close(): Promise<void>;
}

export class ConnectionPool {
  private available: Connection[] = [];
  private inUse: Set<Connection> = new Set();
  private waitQueue: ((conn: Connection) => void)[] = [];
  private closed = false;

  constructor(private options: PoolOptions) {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    for (let i = 0; i < this.options.minConnections; i++) {
      const conn = await this.createConnection();
      this.available.push(conn);
    }

    // Start idle connection reaper
    setInterval(() => this.reapIdleConnections(), this.options.idleTimeout);
  }

  async acquire(): Promise<Connection> {
    if (this.closed) throw new Error('Pool is closed');

    // Try to get an available connection
    while (this.available.length > 0) {
      const conn = this.available.pop()!;
      if (conn.isHealthy) {
        conn.lastUsedAt = new Date();
        this.inUse.add(conn);
        return conn;
      }
      // Unhealthy connection, discard it
      await conn.close();
    }

    // Create new connection if under limit
    if (this.totalConnections < this.options.maxConnections) {
      const conn = await this.createConnection();
      this.inUse.add(conn);
      return conn;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.waitQueue.indexOf(resolve);
        if (idx > -1) this.waitQueue.splice(idx, 1);
        reject(new Error(`Connection acquire timeout after ${this.options.acquireTimeout}ms`));
      }, this.options.acquireTimeout);

      this.waitQueue.push((conn) => {
        clearTimeout(timeout);
        resolve(conn);
      });
    });
  }

  release(conn: Connection): void {
    if (!this.inUse.has(conn)) return;
    this.inUse.delete(conn);

    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      this.inUse.add(conn);
      waiter(conn);
    } else {
      this.available.push(conn);
    }
  }

  async withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    const conn = await this.acquire();
    try {
      return await fn(conn);
    } finally {
      this.release(conn);
    }
  }

  async close(): Promise<void> {
    this.closed = true;

    for (const waiter of this.waitQueue) {
      // This will cause type errors but we need to signal closure
      (waiter as any)(null);
    }
    this.waitQueue = [];

    for (const conn of this.available) {
      await conn.close();
    }
    for (const conn of this.inUse) {
      await conn.close();
    }

    this.available = [];
    this.inUse.clear();
  }

  get totalConnections(): number {
    return this.available.length + this.inUse.size;
  }

  get availableCount(): number {
    return this.available.length;
  }

  get inUseCount(): number {
    return this.inUse.size;
  }

  private async createConnection(): Promise<Connection> {
    const id = Math.random().toString(36).substring(2);
    return {
      id,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      isHealthy: true,
      query: async (sql: string, params?: any[]) => {
        // Simulated query execution
        return [];
      },
      close: async () => {
        // Simulated connection close
      },
    };
  }

  private reapIdleConnections(): void {
    const now = Date.now();
    const minToKeep = this.options.minConnections - this.inUse.size;

    this.available = this.available.filter((conn, index) => {
      if (index < minToKeep) return true;
      const idleTime = now - conn.lastUsedAt.getTime();
      if (idleTime > this.options.idleTimeout) {
        conn.close();
        return false;
      }
      return true;
    });
  }
}

export function createPool(connectionString: string, options?: Partial<PoolOptions>): ConnectionPool {
  return new ConnectionPool({
    maxConnections: 10,
    minConnections: 2,
    acquireTimeout: 5000,
    idleTimeout: 30000,
    connectionString,
    ...options,
  });
}
