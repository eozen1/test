interface BulkheadOptions {
  maxConcurrent: number;
  maxQueued: number;
  queueTimeout: number;
}

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  enqueuedAt: number;
}

export class Bulkhead {
  private running = 0;
  private queue: QueuedTask<any>[] = [];
  private totalExecuted = 0;
  private totalRejected = 0;

  constructor(private options: BulkheadOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running < this.options.maxConcurrent) {
      return this.run(fn);
    }

    if (this.queue.length >= this.options.maxQueued) {
      this.totalRejected++;
      throw new BulkheadFullError(
        `Bulkhead full: ${this.running} running, ${this.queue.length} queued`,
      );
    }

    return this.enqueue(fn);
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.running++;
    try {
      const result = await fn();
      this.totalExecuted++;
      return result;
    } finally {
      this.running--;
      this.dequeue();
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };
      this.queue.push(task);

      setTimeout(() => {
        const index = this.queue.indexOf(task);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.totalRejected++;
          reject(new BulkheadTimeoutError(
            `Queue timeout after ${this.options.queueTimeout}ms`,
          ));
        }
      }, this.options.queueTimeout);
    });
  }

  private dequeue(): void {
    if (this.queue.length === 0) return;

    const task = this.queue.shift()!;
    const waitTime = Date.now() - task.enqueuedAt;

    if (waitTime > this.options.queueTimeout) {
      this.totalRejected++;
      task.reject(new BulkheadTimeoutError(`Queue timeout: waited ${waitTime}ms`));
      this.dequeue();
      return;
    }

    this.run(task.fn).then(task.resolve).catch(task.reject);
  }

  getStats(): {
    running: number;
    queued: number;
    totalExecuted: number;
    totalRejected: number;
    available: number;
  } {
    return {
      running: this.running,
      queued: this.queue.length,
      totalExecuted: this.totalExecuted,
      totalRejected: this.totalRejected,
      available: this.options.maxConcurrent - this.running,
    };
  }

  drain(): void {
    for (const task of this.queue) {
      task.reject(new BulkheadFullError('Bulkhead drained'));
    }
    this.queue = [];
  }
}

export class BulkheadFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkheadFullError';
  }
}

export class BulkheadTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkheadTimeoutError';
  }
}

export function createBulkhead(options?: Partial<BulkheadOptions>): Bulkhead {
  return new Bulkhead({
    maxConcurrent: 10,
    maxQueued: 100,
    queueTimeout: 30000,
    ...options,
  });
}
