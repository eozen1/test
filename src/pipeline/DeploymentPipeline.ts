/**
 * Multi-stage deployment pipeline with validation gates.
 *
 * Stages:
 *   1. Lint source
 *   2. Run unit tests
 *   3. Build Docker image
 *   4. Push image to registry
 *   5. Scan image for vulnerabilities
 *   6. Deploy to staging
 *   7. Run smoke tests against staging
 *   8. Run integration tests against staging
 *   9. Run load tests against staging
 *  10. Manual approval gate
 *  11. Deploy to production
 *  12. Run production healthcheck
 *  13. Notify stakeholders
 *  14. Update release tracker
 */

export type StageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

export interface StageResult {
  stage: string
  status: StageStatus
  durationMs: number
  logs: string[]
  artifacts?: Record<string, string>
}

export interface PipelineConfig {
  repoUrl: string
  branch: string
  commitSha: string
  dockerRegistry: string
  stagingUrl: string
  productionUrl: string
  notifyChannels: string[]
  requireApproval: boolean
  loadTestThresholdRps: number
  vulnerabilitySeverityThreshold: 'low' | 'medium' | 'high' | 'critical'
}

export class DeploymentPipeline {
  private results: StageResult[] = []
  private aborted = false

  constructor(private config: PipelineConfig) {}

  async run(): Promise<StageResult[]> {
    // Phase 1: Validation
    await this.executeStage('lint', () => this.lint())
    await this.executeStage('unit-tests', () => this.runUnitTests())

    if (this.aborted) return this.results

    // Phase 2: Build & Publish
    const imageTag = await this.executeStage('docker-build', () =>
      this.buildDockerImage()
    )
    await this.executeStage('docker-push', () =>
      this.pushToRegistry(imageTag as string)
    )
    await this.executeStage('vulnerability-scan', () =>
      this.scanImage(imageTag as string)
    )

    if (this.aborted) return this.results

    // Phase 3: Staging
    await this.executeStage('deploy-staging', () =>
      this.deployToEnvironment(this.config.stagingUrl, imageTag as string)
    )
    await this.executeStage('smoke-tests', () =>
      this.runSmokeTests(this.config.stagingUrl)
    )
    await this.executeStage('integration-tests', () =>
      this.runIntegrationTests(this.config.stagingUrl)
    )
    await this.executeStage('load-tests', () =>
      this.runLoadTests(this.config.stagingUrl)
    )

    if (this.aborted) return this.results

    // Phase 4: Production
    if (this.config.requireApproval) {
      await this.executeStage('approval-gate', () => this.waitForApproval())
    }
    await this.executeStage('deploy-production', () =>
      this.deployToEnvironment(this.config.productionUrl, imageTag as string)
    )
    await this.executeStage('healthcheck', () =>
      this.runHealthcheck(this.config.productionUrl)
    )

    // Phase 5: Post-deploy
    await this.executeStage('notify', () =>
      this.notifyStakeholders()
    )
    await this.executeStage('update-tracker', () =>
      this.updateReleaseTracker()
    )

    return this.results
  }

  private async executeStage(
    name: string,
    fn: () => Promise<unknown>
  ): Promise<unknown> {
    if (this.aborted) {
      this.results.push({
        stage: name,
        status: 'skipped',
        durationMs: 0,
        logs: ['Skipped due to earlier failure'],
      })
      return null
    }

    const start = Date.now()
    try {
      const result = await fn()
      this.results.push({
        stage: name,
        status: 'passed',
        durationMs: Date.now() - start,
        logs: [`Stage ${name} completed successfully`],
      })
      return result
    } catch (err) {
      this.aborted = true
      this.results.push({
        stage: name,
        status: 'failed',
        durationMs: Date.now() - start,
        logs: [`Stage ${name} failed: ${(err as Error).message}`],
      })
      return null
    }
  }

  private async lint(): Promise<void> {
    // Run eslint + prettier checks
    const { execSync } = await import('child_process')
    execSync('npx eslint . --max-warnings 0', { cwd: process.cwd() })
    execSync('npx prettier --check .', { cwd: process.cwd() })
  }

  private async runUnitTests(): Promise<void> {
    const { execSync } = await import('child_process')
    execSync('npx jest --ci --coverage --coverageThreshold=\'{"global":{"branches":80}}\'', {
      cwd: process.cwd(),
    })
  }

  private async buildDockerImage(): Promise<string> {
    const tag = `${this.config.dockerRegistry}/${this.config.commitSha.slice(0, 8)}`
    const { execSync } = await import('child_process')
    execSync(`docker build -t ${tag} .`, { cwd: process.cwd() })
    return tag
  }

  private async pushToRegistry(tag: string): Promise<void> {
    const { execSync } = await import('child_process')
    execSync(`docker push ${tag}`)
  }

  private async scanImage(tag: string): Promise<void> {
    const { execSync } = await import('child_process')
    const output = execSync(`trivy image --severity ${this.config.vulnerabilitySeverityThreshold} ${tag}`)
    if (output.toString().includes('CRITICAL')) {
      throw new Error('Critical vulnerabilities found in image')
    }
  }

  private async deployToEnvironment(url: string, imageTag: string): Promise<void> {
    const response = await fetch(`${url}/api/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageTag, commit: this.config.commitSha }),
    })
    if (!response.ok) {
      throw new Error(`Deploy failed with status ${response.status}`)
    }
    // Wait for rollout
    await this.waitForRollout(url)
  }

  private async waitForRollout(url: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) return
      await new Promise((r) => setTimeout(r, 10_000))
    }
    throw new Error('Rollout timed out after 5 minutes')
  }

  private async runSmokeTests(url: string): Promise<void> {
    const endpoints = ['/api/health', '/api/status', '/api/version']
    for (const ep of endpoints) {
      const res = await fetch(`${url}${ep}`)
      if (!res.ok) throw new Error(`Smoke test failed: ${ep} returned ${res.status}`)
    }
  }

  private async runIntegrationTests(url: string): Promise<void> {
    const { execSync } = await import('child_process')
    execSync(`npx jest --config jest.integration.config.ts --testPathPattern=integration`, {
      env: { ...process.env, API_URL: url },
    })
  }

  private async runLoadTests(url: string): Promise<void> {
    const { execSync } = await import('child_process')
    const output = execSync(
      `k6 run --vus 50 --duration 60s --env API_URL=${url} load-test.js`
    )
    const rps = parseFloat(output.toString().match(/http_reqs.*?(\d+\.?\d*)/)?.[1] || '0')
    if (rps < this.config.loadTestThresholdRps) {
      throw new Error(`Load test RPS ${rps} below threshold ${this.config.loadTestThresholdRps}`)
    }
  }

  private async waitForApproval(): Promise<void> {
    // Poll approval endpoint
    for (let i = 0; i < 720; i++) {
      const res = await fetch('https://deploy.internal/api/approvals/' + this.config.commitSha)
      const data = (await res.json()) as { approved: boolean }
      if (data.approved) return
      await new Promise((r) => setTimeout(r, 5_000))
    }
    throw new Error('Approval timed out after 1 hour')
  }

  private async runHealthcheck(url: string): Promise<void> {
    const checks = ['database', 'cache', 'queue', 'storage']
    for (const check of checks) {
      const res = await fetch(`${url}/api/health/${check}`)
      if (!res.ok) throw new Error(`Healthcheck failed: ${check}`)
    }
  }

  private async notifyStakeholders(): Promise<void> {
    for (const channel of this.config.notifyChannels) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SLACK_TOKEN}` },
        body: JSON.stringify({
          channel,
          text: `Deployed ${this.config.commitSha.slice(0, 8)} to production from ${this.config.branch}`,
        }),
      })
    }
  }

  private async updateReleaseTracker(): Promise<void> {
    await fetch('https://releases.internal/api/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit: this.config.commitSha,
        branch: this.config.branch,
        stages: this.results,
        deployedAt: new Date().toISOString(),
      }),
    })
  }
}
