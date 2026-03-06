import crypto from 'crypto'

interface PipelineStep<T = unknown> {
  name: string
  execute: (input: T) => Promise<T>
  rollback?: (input: T) => Promise<void>
  timeout?: number
}

interface PipelineResult<T> {
  success: boolean
  output: T | null
  stepsCompleted: string[]
  error?: string
  duration: number
}

interface PipelineConfig {
  maxRetries: number
  retryDelay: number
  enableLogging: boolean
  onStepComplete?: (stepName: string, duration: number) => void
}

const DEFAULT_CONFIG: PipelineConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  enableLogging: true,
}

export class PipelineProcessor<T = unknown> {
  private steps: PipelineStep<T>[] = []
  private config: PipelineConfig
  private executionHistory: Map<string, { startTime: number; endTime: number; success: boolean }[]> = new Map()

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  addStep(step: PipelineStep<T>): this {
    this.steps.push(step)
    return this
  }

  removeStep(name: string): boolean {
    const index = this.steps.findIndex(s => s.name === name)
    if (index === -1) return false
    this.steps.splice(index, 1)
    return true
  }

  async execute(input: T): Promise<PipelineResult<T>> {
    const startTime = Date.now()
    const completedSteps: string[] = []
    let current = input

    for (const step of this.steps) {
      const stepStart = Date.now()
      let success = false

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          if (step.timeout) {
            current = await Promise.race([
              step.execute(current),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Step "${step.name}" timed out`)), step.timeout)
              ),
            ])
          } else {
            current = await step.execute(current)
          }
          success = true
          break
        } catch (err) {
          if (attempt < this.config.maxRetries) {
            await this.delay(this.config.retryDelay * (attempt + 1))
          } else {
            // Rollback completed steps in reverse
            for (const completedName of [...completedSteps].reverse()) {
              const completedStep = this.steps.find(s => s.name === completedName)
              if (completedStep?.rollback) {
                await completedStep.rollback(current)
              }
            }

            return {
              success: false,
              output: null,
              stepsCompleted: completedSteps,
              error: err instanceof Error ? err.message : String(err),
              duration: Date.now() - startTime,
            }
          }
        }
      }

      if (success) {
        completedSteps.push(step.name)
        this.recordExecution(step.name, stepStart, true)
        this.config.onStepComplete?.(step.name, Date.now() - stepStart)
      }
    }

    return {
      success: true,
      output: current,
      stepsCompleted: completedSteps,
      duration: Date.now() - startTime,
    }
  }

  getMetrics(stepName: string): { avgDuration: number; successRate: number; totalRuns: number } | null {
    const history = this.executionHistory.get(stepName)
    if (!history || history.length === 0) return null

    const totalRuns = history.length
    const successCount = history.filter(h => h.success).length
    const avgDuration = history.reduce((sum, h) => sum + (h.endTime - h.startTime), 0) / totalRuns

    return {
      avgDuration,
      successRate: successCount / totalRuns,
      totalRuns,
    }
  }

  private recordExecution(stepName: string, startTime: number, success: boolean): void {
    if (!this.executionHistory.has(stepName)) {
      this.executionHistory.set(stepName, [])
    }
    this.executionHistory.get(stepName)!.push({
      startTime,
      endTime: Date.now(),
      success,
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Data transformation pipeline utilities
export function createTransformStep<T>(
  name: string,
  transform: (data: T) => T,
): PipelineStep<T> {
  return {
    name,
    execute: async (input) => transform(input),
  }
}

export function createValidationStep<T>(
  name: string,
  validate: (data: T) => boolean,
  errorMessage?: string,
): PipelineStep<T> {
  return {
    name,
    execute: async (input) => {
      if (!validate(input)) {
        throw new Error(errorMessage ?? `Validation failed at step "${name}"`)
      }
      return input
    },
  }
}

export function createBatchStep<T extends unknown[]>(
  name: string,
  batchSize: number,
  process: (batch: T) => Promise<T>,
): PipelineStep<T> {
  return {
    name,
    execute: async (input) => {
      const results: unknown[] = []
      for (let i = 0; i < input.length; i += batchSize) {
        const batch = input.slice(i, i + batchSize) as T
        const processed = await process(batch)
        results.push(...processed)
      }
      return results as T
    },
  }
}

// Checksum utility for data integrity verification
export function computeChecksum(data: unknown): string {
  const serialized = JSON.stringify(data, Object.keys(data as object).sort())
  return crypto.createHash('sha256').update(serialized).digest('hex')
}
