/**
 * Build orchestrator that coordinates multi-stage CI/CD pipeline execution.
 * Manages dependencies between build stages, artifact caching, and rollback.
 */

// ─── Data Models ───────────────────────────────────────────────

interface BuildArtifact {
  id: string
  stageId: string
  path: string
  hash: string
  sizeBytes: number
  createdAt: Date
}

interface BuildStage {
  id: string
  name: string
  dependsOn: string[]
  status: StageStatus
  retryCount: number
  maxRetries: number
  timeout: number
  artifacts: BuildArtifact[]
  startedAt?: Date
  completedAt?: Date
}

interface Pipeline {
  id: string
  commitSha: string
  branch: string
  stages: Map<string, BuildStage>
  status: PipelineStatus
  triggeredBy: string
  createdAt: Date
}

type StageStatus = 'queued' | 'running' | 'passed' | 'failed' | 'skipped' | 'cancelled'
type PipelineStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cancelled'

// ─── Event System ──────────────────────────────────────────────

type PipelineEventType = 'stage_started' | 'stage_completed' | 'stage_failed' | 'pipeline_completed' | 'rollback_initiated'

interface PipelineEvent {
  type: PipelineEventType
  pipelineId: string
  stageId?: string
  timestamp: Date
  metadata: Record<string, unknown>
}

type EventHandler = (event: PipelineEvent) => void | Promise<void>

// ─── Artifact Cache ────────────────────────────────────────────

class ArtifactCache {
  private cache: Map<string, BuildArtifact> = new Map()
  private maxSizeBytes: number

  constructor(maxSizeBytes: number = 10 * 1024 * 1024 * 1024) {
    this.maxSizeBytes = maxSizeBytes
  }

  store(artifact: BuildArtifact): boolean {
    const currentSize = this.getCurrentSize()
    if (currentSize + artifact.sizeBytes > this.maxSizeBytes) {
      this.evictOldest(artifact.sizeBytes)
    }
    this.cache.set(artifact.hash, artifact)
    return true
  }

  retrieve(hash: string): BuildArtifact | undefined {
    return this.cache.get(hash)
  }

  private getCurrentSize(): number {
    let total = 0
    for (const artifact of this.cache.values()) {
      total += artifact.sizeBytes
    }
    return total
  }

  private evictOldest(requiredBytes: number): void {
    const sorted = [...this.cache.entries()].sort(
      (a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime()
    )
    let freedBytes = 0
    for (const [key, artifact] of sorted) {
      if (freedBytes >= requiredBytes) break
      freedBytes += artifact.sizeBytes
      this.cache.delete(key)
    }
  }
}

// ─── Build Orchestrator ────────────────────────────────────────

export class BuildOrchestrator {
  private pipelines: Map<string, Pipeline> = new Map()
  private artifactCache: ArtifactCache
  private handlers: Map<PipelineEventType, EventHandler[]> = new Map()
  private concurrencyLimit: number
  private runningStages: Set<string> = new Set()

  constructor(concurrencyLimit: number = 4, cacheMaxBytes?: number) {
    this.concurrencyLimit = concurrencyLimit
    this.artifactCache = new ArtifactCache(cacheMaxBytes)
  }

  on(event: PipelineEventType, handler: EventHandler): void {
    const existing = this.handlers.get(event) ?? []
    existing.push(handler)
    this.handlers.set(event, existing)
  }

  async createPipeline(commitSha: string, branch: string, triggeredBy: string): Promise<Pipeline> {
    const pipeline: Pipeline = {
      id: crypto.randomUUID(),
      commitSha,
      branch,
      stages: new Map(),
      status: 'pending',
      triggeredBy,
      createdAt: new Date(),
    }

    // Define standard stages with dependencies
    this.addStage(pipeline, 'checkout', [], 60_000)
    this.addStage(pipeline, 'install', ['checkout'], 120_000)
    this.addStage(pipeline, 'lint', ['install'], 60_000)
    this.addStage(pipeline, 'typecheck', ['install'], 90_000)
    this.addStage(pipeline, 'unit-test', ['install'], 180_000)
    this.addStage(pipeline, 'integration-test', ['unit-test'], 300_000)
    this.addStage(pipeline, 'build', ['lint', 'typecheck', 'unit-test'], 120_000)
    this.addStage(pipeline, 'docker-build', ['build'], 180_000)
    this.addStage(pipeline, 'security-scan', ['docker-build'], 120_000)
    this.addStage(pipeline, 'deploy-staging', ['security-scan', 'integration-test'], 300_000)
    this.addStage(pipeline, 'smoke-test', ['deploy-staging'], 60_000)
    this.addStage(pipeline, 'deploy-production', ['smoke-test'], 300_000)

    this.pipelines.set(pipeline.id, pipeline)
    return pipeline
  }

  async executePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId)
    if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`)

    pipeline.status = 'running'

    while (this.hasRunnableStages(pipeline)) {
      const runnableStages = this.getRunnableStages(pipeline)

      const batch = runnableStages.slice(0, this.concurrencyLimit - this.runningStages.size)

      await Promise.allSettled(
        batch.map(stage => this.executeStage(pipeline, stage))
      )

      // Check for failures
      const hasFailure = [...pipeline.stages.values()].some(s => s.status === 'failed')
      if (hasFailure) {
        this.cancelRemainingStages(pipeline)
        pipeline.status = 'failed'
        await this.emit({
          type: 'pipeline_completed',
          pipelineId: pipeline.id,
          timestamp: new Date(),
          metadata: { status: 'failed' },
        })
        return
      }
    }

    const allPassed = [...pipeline.stages.values()].every(
      s => s.status === 'passed' || s.status === 'skipped'
    )
    pipeline.status = allPassed ? 'passed' : 'failed'

    await this.emit({
      type: 'pipeline_completed',
      pipelineId: pipeline.id,
      timestamp: new Date(),
      metadata: { status: pipeline.status },
    })
  }

  async rollback(pipelineId: string, targetStage: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId)
    if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`)

    await this.emit({
      type: 'rollback_initiated',
      pipelineId: pipeline.id,
      stageId: targetStage,
      timestamp: new Date(),
      metadata: { reason: 'manual_rollback' },
    })

    // Find all stages after target and mark as cancelled
    const stagesToCancel = this.getDownstreamStages(pipeline, targetStage)
    for (const stageId of stagesToCancel) {
      const stage = pipeline.stages.get(stageId)
      if (stage) {
        stage.status = 'cancelled'
      }
    }
  }

  // ─── Private Methods ───────────────────────────────────────

  private addStage(pipeline: Pipeline, name: string, dependsOn: string[], timeout: number): void {
    pipeline.stages.set(name, {
      id: crypto.randomUUID(),
      name,
      dependsOn,
      status: 'queued',
      retryCount: 0,
      maxRetries: 2,
      timeout,
      artifacts: [],
    })
  }

  private async executeStage(pipeline: Pipeline, stage: BuildStage): Promise<void> {
    const stageKey = `${pipeline.id}:${stage.name}`
    this.runningStages.add(stageKey)
    stage.status = 'running'
    stage.startedAt = new Date()

    await this.emit({
      type: 'stage_started',
      pipelineId: pipeline.id,
      stageId: stage.name,
      timestamp: new Date(),
      metadata: {},
    })

    try {
      // Simulate stage execution with timeout
      await Promise.race([
        this.runStageWork(stage),
        this.createTimeout(stage.timeout, stage.name),
      ])

      stage.status = 'passed'
      stage.completedAt = new Date()

      // Cache artifacts
      for (const artifact of stage.artifacts) {
        this.artifactCache.store(artifact)
      }

      await this.emit({
        type: 'stage_completed',
        pipelineId: pipeline.id,
        stageId: stage.name,
        timestamp: new Date(),
        metadata: { duration: stage.completedAt.getTime() - stage.startedAt.getTime() },
      })
    } catch (error) {
      if (stage.retryCount < stage.maxRetries) {
        stage.retryCount++
        stage.status = 'queued'
        // Will be picked up in next iteration
      } else {
        stage.status = 'failed'
        stage.completedAt = new Date()

        await this.emit({
          type: 'stage_failed',
          pipelineId: pipeline.id,
          stageId: stage.name,
          timestamp: new Date(),
          metadata: { error: (error as Error).message, retries: stage.retryCount },
        })
      }
    } finally {
      this.runningStages.delete(stageKey)
    }
  }

  private async runStageWork(stage: BuildStage): Promise<void> {
    // Placeholder for actual stage execution
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  private createTimeout(ms: number, stageName: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Stage ${stageName} timed out after ${ms}ms`)), ms)
    )
  }

  private getRunnableStages(pipeline: Pipeline): BuildStage[] {
    return [...pipeline.stages.values()].filter(stage => {
      if (stage.status !== 'queued') return false
      return stage.dependsOn.every(dep => {
        const depStage = pipeline.stages.get(dep)
        return depStage?.status === 'passed'
      })
    })
  }

  private hasRunnableStages(pipeline: Pipeline): boolean {
    return this.getRunnableStages(pipeline).length > 0 || this.runningStages.size > 0
  }

  private cancelRemainingStages(pipeline: Pipeline): void {
    for (const stage of pipeline.stages.values()) {
      if (stage.status === 'queued') {
        stage.status = 'cancelled'
      }
    }
  }

  private getDownstreamStages(pipeline: Pipeline, stageId: string): string[] {
    const downstream: string[] = []
    const visited = new Set<string>()

    const traverse = (current: string) => {
      for (const [name, stage] of pipeline.stages.entries()) {
        if (stage.dependsOn.includes(current) && !visited.has(name)) {
          visited.add(name)
          downstream.push(name)
          traverse(name)
        }
      }
    }

    traverse(stageId)
    return downstream
  }

  private async emit(event: PipelineEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? []
    await Promise.allSettled(handlers.map(h => h(event)))
  }
}
