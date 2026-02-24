import { CircuitBreaker } from './circuit-breaker';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latency: number;
  message?: string;
  lastChecked: Date;
}

interface SystemHealth {
  status: HealthStatus;
  components: ComponentHealth[];
  timestamp: Date;
  version: string;
}

type HealthCheckFn = () => Promise<{ healthy: boolean; message?: string }>;

export class HealthChecker {
  private checks = new Map<string, { fn: HealthCheckFn; critical: boolean }>();
  private lastResults = new Map<string, ComponentHealth>();

  register(name: string, fn: HealthCheckFn, critical = true): this {
    this.checks.set(name, { fn, critical });
    return this;
  }

  unregister(name: string): boolean {
    this.lastResults.delete(name);
    return this.checks.delete(name);
  }

  async check(version: string): Promise<SystemHealth> {
    const components: ComponentHealth[] = [];

    for (const [name, { fn }] of this.checks) {
      const start = Date.now();
      try {
        const result = await fn();
        const health: ComponentHealth = {
          name,
          status: result.healthy ? 'healthy' : 'unhealthy',
          latency: Date.now() - start,
          message: result.message,
          lastChecked: new Date(),
        };
        components.push(health);
        this.lastResults.set(name, health);
      } catch (error) {
        const health: ComponentHealth = {
          name,
          status: 'unhealthy',
          latency: Date.now() - start,
          message: error instanceof Error ? error.message : 'Unknown error',
          lastChecked: new Date(),
        };
        components.push(health);
        this.lastResults.set(name, health);
      }
    }

    const hasCriticalFailure = components.some((c) => {
      const check = this.checks.get(c.name);
      return check?.critical && c.status === 'unhealthy';
    });

    const hasAnyFailure = components.some((c) => c.status === 'unhealthy');

    let overallStatus: HealthStatus;
    if (hasCriticalFailure) {
      overallStatus = 'unhealthy';
    } else if (hasAnyFailure) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      components,
      timestamp: new Date(),
      version,
    };
  }

  getCached(name: string): ComponentHealth | undefined {
    return this.lastResults.get(name);
  }

  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }
}

export function createDatabaseHealthCheck(pool: { withConnection: <T>(fn: (conn: any) => Promise<T>) => Promise<T> }): HealthCheckFn {
  return async () => {
    try {
      await pool.withConnection(async (conn) => {
        await conn.query('SELECT 1');
      });
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : 'DB unreachable' };
    }
  };
}

export function createCircuitBreakerHealthCheck(breaker: CircuitBreaker<any>): HealthCheckFn {
  return async () => {
    const stats = breaker.getStats();
    return {
      healthy: !breaker.isOpen(),
      message: `State: ${stats.state}, failures: ${stats.failures}`,
    };
  };
}
