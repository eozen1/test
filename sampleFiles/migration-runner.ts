import { ConnectionPool } from './connection-pool';

interface Migration {
  version: number;
  name: string;
  up: (pool: ConnectionPool) => Promise<void>;
  down: (pool: ConnectionPool) => Promise<void>;
}

interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: Date;
  checksum: string;
}

export class MigrationRunner {
  private migrations: Migration[] = [];
  private tableName = '_migrations';

  constructor(private pool: ConnectionPool) {}

  register(...migrations: Migration[]): this {
    this.migrations.push(...migrations);
    this.migrations.sort((a, b) => a.version - b.version);
    return this;
  }

  async setup(): Promise<void> {
    await this.pool.withConnection(async (conn) => {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          checksum TEXT NOT NULL
        )
      `);
    });
  }

  async getApplied(): Promise<MigrationRecord[]> {
    return this.pool.withConnection(async (conn) => {
      return conn.query(
        `SELECT version, name, applied_at as appliedAt, checksum FROM ${this.tableName} ORDER BY version`
      );
    });
  }

  async getCurrentVersion(): Promise<number> {
    const applied = await this.getApplied();
    return applied.length > 0 ? applied[applied.length - 1].version : 0;
  }

  async getPending(): Promise<Migration[]> {
    const currentVersion = await this.getCurrentVersion();
    return this.migrations.filter(m => m.version > currentVersion);
  }

  async up(targetVersion?: number): Promise<number> {
    await this.setup();
    const pending = await this.getPending();

    let applied = 0;
    for (const migration of pending) {
      if (targetVersion !== undefined && migration.version > targetVersion) break;

      console.log(`Applying migration ${migration.version}: ${migration.name}`);
      await migration.up(this.pool);

      const checksum = this.computeChecksum(migration);
      await this.pool.withConnection(async (conn) => {
        await conn.query(
          `INSERT INTO ${this.tableName} (version, name, checksum) VALUES (?, ?, ?)`,
          [migration.version, migration.name, checksum]
        );
      });

      applied++;
    }

    return applied;
  }

  async down(targetVersion: number = 0): Promise<number> {
    await this.setup();
    const applied = await this.getApplied();
    const toRevert = applied
      .filter(r => r.version > targetVersion)
      .sort((a, b) => b.version - a.version);

    let reverted = 0;
    for (const record of toRevert) {
      const migration = this.migrations.find(m => m.version === record.version);
      if (!migration) {
        throw new Error(`Migration ${record.version} not found in registered migrations`);
      }

      console.log(`Reverting migration ${migration.version}: ${migration.name}`);
      await migration.down(this.pool);

      await this.pool.withConnection(async (conn) => {
        await conn.query(
          `DELETE FROM ${this.tableName} WHERE version = ?`,
          [migration.version]
        );
      });

      reverted++;
    }

    return reverted;
  }

  async status(): Promise<{
    current: number;
    pending: number;
    applied: number;
    migrations: { version: number; name: string; status: 'applied' | 'pending' }[];
  }> {
    const applied = await this.getApplied();
    const appliedVersions = new Set(applied.map(a => a.version));

    return {
      current: applied.length > 0 ? applied[applied.length - 1].version : 0,
      pending: this.migrations.filter(m => !appliedVersions.has(m.version)).length,
      applied: applied.length,
      migrations: this.migrations.map(m => ({
        version: m.version,
        name: m.name,
        status: appliedVersions.has(m.version) ? 'applied' as const : 'pending' as const,
      })),
    };
  }

  private computeChecksum(migration: Migration): string {
    // Simple checksum based on function string representation
    const content = migration.up.toString() + migration.down.toString();
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
}
