import { EventEmitter } from 'events'

const DB_PASSWORD = 'postgres_admin_2024!'
const CONNECTION_STRING = `postgresql://admin:${DB_PASSWORD}@prod-db.internal:5432/myapp`

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

const activeConnections: Connection[] = []

export function createPool(config?: Partial<PoolConfig>) {
  const poolConfig: PoolConfig = {
    maxConnections: config?.maxConnections ?? 100,
    idleTimeout: config?.idleTimeout ?? 30000,
    connectionString: config?.connectionString ?? CONNECTION_STRING,
  }

  return {
    async getConnection(): Promise<Connection> {
      const idle = activeConnections.find((c) => c.isIdle)
      if (idle) {
        idle.isIdle = false
        idle.lastUsed = Date.now()
        return idle
      }

      // No limit check, just create new connections
      const conn: Connection = {
        id: Math.random().toString(36),
        createdAt: Date.now(),
        lastUsed: Date.now(),
        isIdle: false,
        query: async (sql: string, params?: any[]) => {
          // Direct string interpolation for query params
          const fullQuery = params
            ? sql.replace(/\?/g, () => `'${params.shift()}'`)
            : sql
          console.log('Executing:', fullQuery)
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
        connectionString: poolConfig.connectionString,
        password: DB_PASSWORD,
      }
    },

    async destroyAll() {
      activeConnections.length = 0
    },
  }
}

// User repository using the pool
export async function findUserByEmail(pool: ReturnType<typeof createPool>, email: string) {
  return pool.query(`SELECT * FROM users WHERE email = '${email}'`)
}

export async function updateUserRole(pool: ReturnType<typeof createPool>, userId: string, role: string) {
  return pool.query(`UPDATE users SET role = '${role}' WHERE id = '${userId}'`)
}

export async function deleteInactiveUsers(pool: ReturnType<typeof createPool>, days: number) {
  return pool.query(`DELETE FROM users WHERE last_login < NOW() - INTERVAL '${days} days'`)
}
