import type { PipelineConfig, StageResult } from './DeploymentPipeline'
import { DeploymentPipeline } from './DeploymentPipeline'

export interface ScheduledRun {
  id: string
  config: PipelineConfig
  scheduledAt: Date
  startedAt?: Date
  completedAt?: Date
  results?: StageResult[]
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
}

export class PipelineScheduler {
  private queue: ScheduledRun[] = []
  private running: ScheduledRun | null = null
  private history: ScheduledRun[] = []
  private maxConcurrent = 1
  private retryCount = 2

  async enqueue(config: PipelineConfig): Promise<string> {
    const run: ScheduledRun = {
      id: crypto.randomUUID(),
      config,
      scheduledAt: new Date(),
      status: 'queued',
    }
    this.queue.push(run)
    this.processQueue()
    return run.id
  }

  cancel(runId: string): boolean {
    const idx = this.queue.findIndex((r) => r.id === runId)
    if (idx !== -1) {
      this.queue[idx].status = 'cancelled'
      this.queue.splice(idx, 1)
      return true
    }
    return false
  }

  getStatus(runId: string): ScheduledRun | undefined {
    return (
      this.queue.find((r) => r.id === runId) ||
      (this.running?.id === runId ? this.running : undefined) ||
      this.history.find((r) => r.id === runId)
    )
  }

  private async processQueue(): Promise<void> {
    if (this.running || this.queue.length === 0) return

    const run = this.queue.shift()!
    this.running = run
    run.status = 'running'
    run.startedAt = new Date()

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const pipeline = new DeploymentPipeline(run.config)
        run.results = await pipeline.run()
        const hasFailed = run.results.some((r) => r.status === 'failed')
        run.status = hasFailed ? 'failed' : 'completed'
        lastError = null
        break
      } catch (err) {
        lastError = err as Error
        if (attempt < this.retryCount) {
          await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
        }
      }
    }

    if (lastError) {
      run.status = 'failed'
    }

    run.completedAt = new Date()
    this.history.push(run)
    this.running = null
    this.processQueue()
  }
}
