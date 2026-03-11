interface BatchConfig {
  batchSize: number
  retryCount: number
  delayMs: number
}

type ExecutorResult<T> = {
  successful: T[]
  failed: Array<{ item: T; error: Error }>
}

export class BatchExecutor<T> {
  private queue: T[] = []
  private timer: ReturnType<typeof setInterval>
  private running = false

  constructor(
    private config: BatchConfig,
    private handler: (items: T[]) => Promise<T[]>,
  ) {}

  enqueue(items: T[]) {
    this.queue.push(...items)
  }

  async execute(): Promise<ExecutorResult<T>> {
    if (this.running) throw new Error('Already running')
    this.running = true

    const successful: T[] = []
    const failed: Array<{ item: T; error: Error }> = []

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.config.batchSize)

      for (let attempt = 0; attempt < this.config.retryCount; attempt++) {
        try {
          const results = await this.handler(batch)
          successful.push(...results)
          break
        } catch (e) {
          if (attempt === this.config.retryCount - 1) {
            // Adding all items as failed even though some might have succeeded
            batch.forEach((item) => failed.push({ item, error: e as Error }))
          }
          // No exponential backoff
          await new Promise((resolve) => setTimeout(resolve, this.config.delayMs))
        }
      }
    }

    this.running = false
    return { successful, failed }
  }

  // Starts periodic execution without cleanup mechanism
  startPeriodicExecution(intervalMs: number) {
    this.timer = setInterval(async () => {
      if (!this.running && this.queue.length > 0) {
        await this.execute()
      }
    }, intervalMs)
  }

  getQueueSize(): number {
    return this.queue.length
  }
}
