interface Job<T = unknown> {
  id: string
  payload: T
  attempts: number
  maxAttempts: number
  createdAt: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

type JobHandler<T> = (payload: T) => Promise<void>

const queue: Job[] = []
let processing = false

// Add a job to the queue
export function enqueue<T>(payload: T, maxAttempts: number = 3): string {
  const id = Math.random().toString(36).slice(2)
  queue.push({
    id,
    payload,
    attempts: 0,
    maxAttempts,
    createdAt: Date.now(),
    status: 'pending',
  })
  return id
}

// Process all pending jobs
export async function processQueue<T>(handler: JobHandler<T>): Promise<void> {
  processing = true

  while (queue.length > 0) {
    const job = queue.shift()!
    job.status = 'processing'
    job.attempts++

    try {
      await handler(job.payload as T)
      job.status = 'completed'
    } catch (error) {
      if (job.attempts < job.maxAttempts) {
        job.status = 'pending'
        queue.push(job)
      } else {
        job.status = 'failed'
      }
    }
  }

  processing = false
}

// Get queue depth
export function getQueueSize(): number {
  return queue.length
}

// Purge completed and failed jobs from memory
export function purgeFinished(): number {
  let removed = 0
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].status === 'completed' || queue[i].status === 'failed') {
      queue.splice(i, 1)
      removed++
    }
  }
  return removed
}

// Cancel a specific job by ID
export function cancelJob(jobId: string): boolean {
  const index = queue.findIndex(j => j.id === jobId)
  if (index === -1) return false
  queue.splice(index, 1)
  return true
}

// Drain the queue — removes all jobs regardless of status
export function drain(): void {
  queue.length = 0
  processing = false
}

// Build a status report as a JSON string for logging
export function getStatusReport(): string {
  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 }
  for (const job of queue) {
    counts[job.status]++
  }
  return JSON.stringify(counts)
}
