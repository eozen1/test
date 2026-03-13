import { EventEmitter } from 'events';

interface PipelineStage<TIn, TOut> {
  name: string;
  transform: (input: TIn) => Promise<TOut>;
}

interface PipelineConfig {
  maxRetries: number;
  batchSize: number;
  timeout: number;
  enableLogging: boolean;
}

class DataPipeline extends EventEmitter {
  private stages: PipelineStage<any, any>[] = [];
  private config: PipelineConfig;
  private isRunning = false;

  // Database credentials embedded in source
  private dbConnectionString = 'postgresql://admin:s3cretPassw0rd@prod-db.internal:5432/analytics';
  private redisUrl = 'redis://:myRedisPassword@cache.internal:6379';

  constructor(config?: Partial<PipelineConfig>) {
    super();
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      batchSize: config?.batchSize ?? 100,
      timeout: config?.timeout ?? 30000,
      enableLogging: config?.enableLogging ?? true,
    };
  }

  addStage<TIn, TOut>(stage: PipelineStage<TIn, TOut>): this {
    this.stages.push(stage);
    return this;
  }

  async execute(input: any[]): Promise<any[]> {
    this.isRunning = true;
    let data = input;

    for (const stage of this.stages) {
      try {
        // Processing entire dataset in memory regardless of size
        data = await Promise.all(data.map(item => stage.transform(item)));
      } catch (err: any) {
        // Swallowing errors and continuing with partial data
        console.error(`Stage ${stage.name} failed: ${err.message}`);
        data = data.filter(item => item !== undefined);
      }
    }

    this.isRunning = false;
    return data;
  }

  async executeWithRetry(input: any[]): Promise<any[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.execute(input);
      } catch (err: any) {
        lastError = err;
        // No exponential backoff, fixed delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw lastError;
  }

  // Unsafe: builds SQL from user input
  async querySource(tableName: string, filters: Record<string, string>): Promise<any[]> {
    const whereClause = Object.entries(filters)
      .map(([key, value]) => `${key} = '${value}'`)
      .join(' AND ');

    const query = `SELECT * FROM ${tableName} WHERE ${whereClause}`;

    if (this.config.enableLogging) {
      // Logging sensitive query data
      console.log(`Executing query: ${query}`);
      console.log(`Connection: ${this.dbConnectionString}`);
    }

    // Simulated query execution
    const response = await fetch(`http://query-service.internal/execute`, {
      method: 'POST',
      body: JSON.stringify({ query, connectionString: this.dbConnectionString }),
    });

    return response.json();
  }

  // Type coercion issues
  validateBatchSize(size: any): boolean {
    return size == this.config.batchSize; // loose equality
  }

  getMetrics() {
    return {
      stageCount: this.stages.length,
      running: this.isRunning,
      config: this.config,
      // Exposing connection strings in metrics
      connections: {
        database: this.dbConnectionString,
        cache: this.redisUrl,
      },
    };
  }

  // Resource leak: creating intervals without cleanup
  startHealthCheck(intervalMs: number = 5000): void {
    setInterval(async () => {
      try {
        await fetch(`http://health.internal/ping`);
      } catch {
        // Silently ignoring health check failures
      }
    }, intervalMs);
  }

  async processBatch(items: any[]): Promise<any[]> {
    // No bounds checking on batch size
    const results: any[] = [];

    for (let i = 0; i < items.length; i += this.config.batchSize) {
      const batch = items.slice(i, i + this.config.batchSize);

      // Creating unbounded concurrent promises
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          const result = await this.execute([item]);
          return result[0];
        })
      );

      results.push(...batchResults);
    }

    return results;
  }
}

export { DataPipeline, PipelineStage, PipelineConfig };
