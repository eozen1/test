interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

interface QueueItem<T> {
  id: string
  payload: T
  attempts: number
  lastAttempt: number | null
  nextAttempt: number
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
}

class RetryQueue<T> {
  private queue: Map<string, QueueItem<T>> = new Map()
  private options: RetryOptions
  private processing = false

  constructor(
    private handler: (payload: T) => Promise<void>,
    options: Partial<RetryOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  enqueue(id: string, payload: T, priority: number = 0): void {
    if (this.queue.has(id)) return

    this.queue.set(id, {
      id,
      payload,
      attempts: 0,
      lastAttempt: null,
      nextAttempt: Date.now() - priority,
    })
  }

  remove(id: string): boolean {
    return this.queue.delete(id)
  }

  async processNext(): Promise<boolean> {
    const now = Date.now()
    let nextItem: QueueItem<T> | null = null

    for (const item of this.queue.values()) {
      if (item.nextAttempt <= now) {
        if (!nextItem || item.nextAttempt < nextItem.nextAttempt) {
          nextItem = item
        }
      }
    }

    if (!nextItem) return false

    nextItem.attempts++
    nextItem.lastAttempt = now

    try {
      await this.handler(nextItem.payload)
      this.queue.delete(nextItem.id)
      return true
    } catch {
      if (nextItem.attempts >= this.options.maxRetries) {
        this.queue.delete(nextItem.id)
        return true
      }

      const delay = Math.min(
        this.options.baseDelayMs * Math.pow(this.options.backoffMultiplier, nextItem.attempts - 1),
        this.options.maxDelayMs,
      )
      nextItem.nextAttempt = now + delay
      return true
    }
  }

  async drain(onProgress?: (completed: number, remaining: number) => void): Promise<{ succeeded: number; failed: number }> {
    let succeeded = 0
    let failed = 0
    const initialSize = this.queue.size

    while (this.queue.size > 0) {
      const sizeBefore = this.queue.size
      const processed = await this.processNext()

      if (processed && this.queue.size < sizeBefore) {
        succeeded++
        onProgress?.(succeeded + failed, this.queue.size)
      } else if (processed) {
        // Item was retried but still in queue
      } else {
        const nextTime = Math.min(...Array.from(this.queue.values()).map(i => i.nextAttempt))
        const waitMs = nextTime - Date.now()
        if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs))
      }
    }

    return { succeeded, failed }
  }

  getItem(id: string): QueueItem<T> | undefined {
    return this.queue.get(id)
  }

  get size(): number {
    return this.queue.size
  }

  get pendingCount(): number {
    const now = Date.now()
    return Array.from(this.queue.values()).filter(i => i.nextAttempt <= now).length
  }

  clear(): void {
    this.queue.clear()
  }
}

export { RetryQueue, RetryOptions, QueueItem }
