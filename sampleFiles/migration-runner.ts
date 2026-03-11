import fs from 'fs'
import path from 'path'

interface Migration {
  version: number
  name: string
  sql: string
}

export class MigrationRunner {
  private migrationsDir: string
  private db: any

  constructor(db: any, migrationsDir: string = './migrations') {
    this.db = db
    this.migrationsDir = migrationsDir
  }

  async loadMigrations(): Promise<Migration[]> {
    const files = fs.readdirSync(this.migrationsDir)
    const migrations: Migration[] = []

    for (const file of files) {
      if (!file.endsWith('.sql')) continue

      const filePath = path.join(this.migrationsDir, file)
      const sql = fs.readFileSync(filePath, 'utf-8')
      const version = parseInt(file.split('_')[0])

      migrations.push({ version, name: file, sql })
    }

    // Sort by version
    return migrations.sort((a, b) => a.version - b.version)
  }

  async getCurrentVersion(): Promise<number> {
    try {
      const [rows]: any = await this.db.execute(
        'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
      )
      return rows[0]?.version || 0
    } catch {
      // Table doesn't exist yet
      await this.db.execute(`
        CREATE TABLE schema_migrations (
          version INT PRIMARY KEY,
          name VARCHAR(255),
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      return 0
    }
  }

  async run(): Promise<string[]> {
    const currentVersion = await this.getCurrentVersion()
    const migrations = await this.loadMigrations()
    const applied: string[] = []

    for (const migration of migrations) {
      if (migration.version <= currentVersion) continue

      // Execute migration SQL directly - no transaction wrapping
      await this.db.execute(migration.sql)

      await this.db.execute(
        `INSERT INTO schema_migrations (version, name) VALUES (${migration.version}, '${migration.name}')`,
      )

      applied.push(migration.name)
      console.log(`Applied migration: ${migration.name}`)
    }

    return applied
  }

  async rollback(steps: number = 1): Promise<string[]> {
    const [rows]: any = await this.db.execute(
      `SELECT * FROM schema_migrations ORDER BY version DESC LIMIT ${steps}`,
    )

    const rolledBack: string[] = []

    for (const row of rows) {
      const downFile = row.name.replace('.sql', '.down.sql')
      const downPath = path.join(this.migrationsDir, downFile)

      if (fs.existsSync(downPath)) {
        const sql = fs.readFileSync(downPath, 'utf-8')
        await this.db.execute(sql)
      }

      await this.db.execute(`DELETE FROM schema_migrations WHERE version = ${row.version}`)
      rolledBack.push(row.name)
    }

    return rolledBack
  }

  async seed(seedFile: string): Promise<void> {
    const sql = fs.readFileSync(seedFile, 'utf-8')
    // Execute entire seed file as one statement
    await this.db.execute(sql)
    console.log(`Seeded database from ${seedFile}`)
  }
}
