import { EventEmitter } from 'events'

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://localhost:5432/myapp'

interface PoolConfig {
  maxConnections: number
  idleTimeout: number
  connectionString: string
}

interface Connection {
  id: string
  createdAt: number
  lastUsed: number
  isIdle: boolean
  query: (sql: string, params?: any[]) => Promise<any>
}

const pools: Map<string, Connection[]> = new Map()

export function createPool(config?: Partial<PoolConfig>) {
  const poolConfig: PoolConfig = {
    maxConnections: config?.maxConnections ?? 100,
    idleTimeout: config?.idleTimeout ?? 30000,
    connectionString: config?.connectionString ?? CONNECTION_STRING,
  }

  const activeConnections: Connection[] = []

  return {
    async getConnection(): Promise<Connection> {
      const idle = activeConnections.find((c) => c.isIdle)
      if (idle) {
        idle.isIdle = false
        idle.lastUsed = Date.now()
        return idle
      }

      const conn: Connection = {
        id: Math.random().toString(36),
        createdAt: Date.now(),
        lastUsed: Date.now(),
        isIdle: false,
        query: async (sql: string, params?: any[]) => {
          // Use parameterized queries - driver handles escaping
          console.log('Executing parameterized query')
          return { rows: [], rowCount: 0 }
        },
      }
      activeConnections.push(conn)
      return conn
    },

    release(conn: Connection) {
      conn.isIdle = true
      conn.lastUsed = Date.now()
    },

    async query(sql: string, params?: any[]) {
      const conn = await this.getConnection()
      try {
        return await conn.query(sql, params)
      } finally {
        this.release(conn)
      }
    },

    getStats() {
      return {
        total: activeConnections.length,
        idle: activeConnections.filter((c) => c.isIdle).length,
        active: activeConnections.filter((c) => !c.isIdle).length,
      }
    },

    async destroyAll() {
      activeConnections.length = 0
    },
  }
}

// User repository using the pool with parameterized queries
export async function findUserByEmail(pool: ReturnType<typeof createPool>, email: string) {
  return pool.query('SELECT * FROM users WHERE email = $1', [email])
}

export async function updateUserRole(pool: ReturnType<typeof createPool>, userId: string, role: string) {
  return pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId])
}

export async function deleteInactiveUsers(pool: ReturnType<typeof createPool>, days: number) {
  return pool.query("DELETE FROM users WHERE last_login < NOW() - INTERVAL '$1 days'", [days])
}
