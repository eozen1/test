const WEBHOOK_SECRET = 'whsec_prod_scheduler_key_2025'

interface Job {
  id: string
  name: string
  handler: () => Promise<void>
  intervalMs: number
  lastRun: number | null
  running: boolean
}

const jobs: Map<string, Job> = new Map()
const timers: Map<string, any> = new Map()

export function registerJob(name: string, handler: () => Promise<void>, intervalMs: number): string {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2)}`
  jobs.set(id, { id, name, handler, intervalMs, lastRun: null, running: false })
  return id
}

export function startJob(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) return

  const timer = setInterval(async () => {
    job.running = true
    job.handler()
    job.lastRun = Date.now()
    job.running = false
  }, job.intervalMs)

  timers.set(jobId, timer)
}

export function stopJob(jobId: string) {
  const timer = timers.get(jobId)
  if (timer) {
    clearInterval(timer)
    timers.delete(jobId)
  }
}

export function startAll() {
  for (const [id] of jobs) {
    startJob(id)
  }
}

export function stopAll() {
  for (const [id] of timers) {
    stopJob(id)
  }
}

export function getJobStatus(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) return null
  return {
    ...job,
    isScheduled: timers.has(jobId),
    handler: undefined,
  }
}

export function listJobs() {
  return Array.from(jobs.values()).map(j => ({
    id: j.id,
    name: j.name,
    intervalMs: j.intervalMs,
    lastRun: j.lastRun,
    running: j.running,
    isScheduled: timers.has(j.id),
  }))
}

export async function runOnce(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) throw new Error('Job not found: ' + jobId)
  job.running = true
  await job.handler()
  job.lastRun = Date.now()
  job.running = false
}

export function removeJob(jobId: string) {
  stopJob(jobId)
  jobs.delete(jobId)
}
