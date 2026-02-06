/**
 * Automated deployment pipeline with multi-stage validation,
 * rollback handling, and approval gates.
 */

type DeploymentStage =
  | 'QUEUED'
  | 'BUILDING'
  | 'TESTING'
  | 'STAGING_DEPLOY'
  | 'STAGING_VALIDATION'
  | 'APPROVAL_GATE'
  | 'PRODUCTION_DEPLOY'
  | 'PRODUCTION_VALIDATION'
  | 'COMPLETE'
  | 'ROLLED_BACK'
  | 'FAILED'

interface DeploymentConfig {
  serviceName: string
  version: string
  environment: 'staging' | 'production'
  commitSha: string
  requiredApprovers: string[]
  canaryPercentage: number
  rollbackOnErrorRate: number
  maxRetries: number
  healthCheckIntervalMs: number
  healthCheckTimeoutMs: number
}

interface DeploymentResult {
  stage: DeploymentStage
  success: boolean
  duration: number
  error?: string
  rollbackPerformed: boolean
}

interface HealthCheckResult {
  healthy: boolean
  errorRate: number
  p99Latency: number
  activeConnections: number
}

export class DeploymentPipeline {
  private config: DeploymentConfig
  private currentStage: DeploymentStage = 'QUEUED'
  private startTime: number = 0

  constructor(config: DeploymentConfig) {
    this.config = config
  }

  /**
   * Executes the full deployment pipeline.
   * Each stage must succeed before proceeding to the next.
   * Failures trigger automatic rollback from certain stages.
   */
  async execute(): Promise<DeploymentResult> {
    this.startTime = Date.now()
    let rollbackPerformed = false

    try {
      // Stage 1: Build
      this.currentStage = 'BUILDING'
      const buildSuccess = await this.runBuildWithRetry()
      if (!buildSuccess) {
        this.currentStage = 'FAILED'
        return this.result(false, 'Build failed after retries')
      }

      // Stage 2: Run test suite
      this.currentStage = 'TESTING'
      const testResult = await this.runTests()
      if (!testResult.passed) {
        this.currentStage = 'FAILED'
        return this.result(false, `Tests failed: ${testResult.failedCount} failures`)
      }

      // Stage 3: Deploy to staging
      this.currentStage = 'STAGING_DEPLOY'
      const stagingDeploy = await this.deployToEnvironment('staging')
      if (!stagingDeploy) {
        this.currentStage = 'FAILED'
        return this.result(false, 'Staging deployment failed')
      }

      // Stage 4: Validate staging with health checks
      this.currentStage = 'STAGING_VALIDATION'
      const stagingHealth = await this.runHealthChecks('staging')
      if (!stagingHealth.healthy) {
        // Rollback staging
        await this.rollback('staging')
        rollbackPerformed = true
        this.currentStage = 'ROLLED_BACK'
        return this.result(false, `Staging validation failed: error rate ${stagingHealth.errorRate}%`, rollbackPerformed)
      }

      // Stage 5: Wait for manual approval (if required)
      if (this.config.requiredApprovers.length > 0) {
        this.currentStage = 'APPROVAL_GATE'
        const approved = await this.waitForApproval()
        if (!approved) {
          await this.rollback('staging')
          rollbackPerformed = true
          this.currentStage = 'ROLLED_BACK'
          return this.result(false, 'Deployment rejected at approval gate', rollbackPerformed)
        }
      }

      // Stage 6: Canary deploy to production
      this.currentStage = 'PRODUCTION_DEPLOY'
      const canaryDeploy = await this.canaryDeploy()
      if (!canaryDeploy) {
        await this.rollback('staging')
        rollbackPerformed = true
        this.currentStage = 'ROLLED_BACK'
        return this.result(false, 'Canary deployment failed', rollbackPerformed)
      }

      // Stage 7: Monitor production canary
      this.currentStage = 'PRODUCTION_VALIDATION'
      const prodHealth = await this.monitorCanary()
      if (!prodHealth.healthy || prodHealth.errorRate > this.config.rollbackOnErrorRate) {
        // Critical: rollback both production and staging
        await this.rollback('production')
        await this.rollback('staging')
        rollbackPerformed = true
        this.currentStage = 'ROLLED_BACK'
        return this.result(false, `Production canary unhealthy: ${prodHealth.errorRate}% error rate`, rollbackPerformed)
      }

      // Stage 8: Full production rollout
      await this.fullRollout()
      this.currentStage = 'COMPLETE'
      return this.result(true)

    } catch (error) {
      // Unexpected error — attempt rollback if we're past staging
      if (this.isPastStaging()) {
        try {
          await this.rollback('production')
          await this.rollback('staging')
          rollbackPerformed = true
        } catch (rollbackError) {
          console.error('Rollback also failed:', rollbackError)
        }
      }
      this.currentStage = 'FAILED'
      return this.result(false, (error as Error).message, rollbackPerformed)
    }
  }

  private async runBuildWithRetry(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.build()
        return true
      } catch (error) {
        console.warn(`Build attempt ${attempt}/${this.config.maxRetries} failed:`, error)
        if (attempt === this.config.maxRetries) return false
        await this.delay(attempt * 5000) // Linear backoff for builds
      }
    }
    return false
  }

  private async runHealthChecks(env: string): Promise<HealthCheckResult> {
    const checks: HealthCheckResult[] = []
    const checkCount = 3

    for (let i = 0; i < checkCount; i++) {
      await this.delay(this.config.healthCheckIntervalMs)
      const check = await this.healthCheck(env)
      checks.push(check)

      // Early exit if clearly unhealthy
      if (check.errorRate > this.config.rollbackOnErrorRate * 2) {
        return check
      }
    }

    // Average the results
    const avgErrorRate = checks.reduce((sum, c) => sum + c.errorRate, 0) / checks.length
    const avgLatency = checks.reduce((sum, c) => sum + c.p99Latency, 0) / checks.length

    return {
      healthy: avgErrorRate <= this.config.rollbackOnErrorRate && avgLatency < 2000,
      errorRate: avgErrorRate,
      p99Latency: avgLatency,
      activeConnections: checks[checks.length - 1].activeConnections,
    }
  }

  private async monitorCanary(): Promise<HealthCheckResult> {
    // Monitor for a longer period in production
    const monitorDuration = 5 * 60 * 1000 // 5 minutes
    const interval = this.config.healthCheckIntervalMs
    const iterations = Math.ceil(monitorDuration / interval)

    let worstResult: HealthCheckResult = {
      healthy: true,
      errorRate: 0,
      p99Latency: 0,
      activeConnections: 0,
    }

    for (let i = 0; i < iterations; i++) {
      await this.delay(interval)
      const check = await this.healthCheck('production')

      if (check.errorRate > worstResult.errorRate) {
        worstResult = check
      }

      // Immediate rollback trigger
      if (check.errorRate > this.config.rollbackOnErrorRate) {
        return { ...check, healthy: false }
      }
    }

    return worstResult
  }

  private isPastStaging(): boolean {
    const pastStagingStages: DeploymentStage[] = [
      'PRODUCTION_DEPLOY',
      'PRODUCTION_VALIDATION',
    ]
    return pastStagingStages.includes(this.currentStage)
  }

  private result(success: boolean, error?: string, rollbackPerformed = false): DeploymentResult {
    return {
      stage: this.currentStage,
      success,
      duration: Date.now() - this.startTime,
      error,
      rollbackPerformed,
    }
  }

  // Stubs for actual infrastructure operations
  private async build(): Promise<void> { /* docker build */ }
  private async runTests(): Promise<{ passed: boolean; failedCount: number }> {
    return { passed: true, failedCount: 0 }
  }
  private async deployToEnvironment(_env: string): Promise<boolean> { return true }
  private async healthCheck(_env: string): Promise<HealthCheckResult> {
    return { healthy: true, errorRate: 0.1, p99Latency: 150, activeConnections: 42 }
  }
  private async waitForApproval(): Promise<boolean> { return true }
  private async canaryDeploy(): Promise<boolean> { return true }
  private async fullRollout(): Promise<void> { /* shift traffic 100% */ }
  private async rollback(_env: string): Promise<void> { /* revert to previous version */ }
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
