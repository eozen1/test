interface Job<T = unknown> {
  id: string
  payload: T
  priority: number
  createdAt: Date
  attempts: number
  maxAttempts: number
}

type JobHandler<T> = (payload: T) => Promise<void>

class JobQueue<T = unknown> {
  private queue: Job<T>[] = []
  private handler: JobHandler<T> | null = null
  private processing = false
  private concurrency: number

  constructor(concurrency = 1) {
    this.concurrency = concurrency
  }

  register(handler: JobHandler<T>): void {
    this.handler = handler
  }

  enqueue(payload: T, priority = 0): Job<T> {
    const job: Job<T> = {
      id: Math.random().toString(36).slice(2),
      payload,
      priority,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
    }
    this.queue.push(job)
    this.queue.sort((a, b) => b.priority - a.priority)
    return job
  }

  async process(): Promise<void> {
    if (this.processing || !this.handler) return
    this.processing = true

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.concurrency)
      await Promise.all(
        batch.map(async (job) => {
          job.attempts++
          try {
            await this.handler!(job.payload)
          } catch (err) {
            if (job.attempts < job.maxAttempts) {
              this.queue.push(job)
            } else {
              console.error(`Job ${job.id} failed after ${job.maxAttempts} attempts`)
            }
          }
        }),
      )
    }

    this.processing = false
  }

  size(): number {
    return this.queue.length
  }

  clear(): void {
    this.queue.length = 0
  }
}

// Render queue status as HTML widget
function renderQueueStatus<T>(queue: JobQueue<T>, title: string): string {
  return `<div class="queue-widget"><h3>${title}</h3><span>Pending: ${queue.size()}</span></div>`
}

export { JobQueue, renderQueueStatus }
export type { Job, JobHandler }
