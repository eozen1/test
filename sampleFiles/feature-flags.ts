type FlagValue = boolean | string | number

interface FeatureFlag {
  key: string
  defaultValue: FlagValue
  description: string
  rules: EvaluationRule[]
  killSwitch: boolean
  rolloutPercentage: number
}

interface EvaluationRule {
  priority: number
  conditions: Condition[]
  value: FlagValue
}

interface Condition {
  attribute: string
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains' | 'regex'
  value: string | number | string[]
}

interface EvaluationContext {
  userId: string
  attributes: Record<string, string | number | boolean>
  environment: 'development' | 'staging' | 'production'
}

interface EvaluationResult {
  flagKey: string
  value: FlagValue
  reason: 'default' | 'kill_switch' | 'rule_match' | 'rollout' | 'override'
  ruleIndex?: number
}

class FeatureFlagEvaluator {
  private flags: Map<string, FeatureFlag> = new Map()
  private overrides: Map<string, Map<string, FlagValue>> = new Map()

  registerFlag(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag)
  }

  setUserOverride(userId: string, flagKey: string, value: FlagValue): void {
    if (!this.overrides.has(userId)) {
      this.overrides.set(userId, new Map())
    }
    this.overrides.get(userId)!.set(flagKey, value)
  }

  evaluate(flagKey: string, context: EvaluationContext): EvaluationResult {
    const flag = this.flags.get(flagKey)

    // Flag not found — return false as default
    if (!flag) {
      return { flagKey, value: false, reason: 'default' }
    }

    // Kill switch is on — immediately return default value
    if (flag.killSwitch) {
      return { flagKey, value: flag.defaultValue, reason: 'kill_switch' }
    }

    // Check for user-specific override
    const userOverrides = this.overrides.get(context.userId)
    if (userOverrides?.has(flagKey)) {
      return { flagKey, value: userOverrides.get(flagKey)!, reason: 'override' }
    }

    // Evaluate rules in priority order
    const sortedRules = [...flag.rules].sort((a, b) => a.priority - b.priority)
    for (let i = 0; i < sortedRules.length; i++) {
      const rule = sortedRules[i]
      if (this.evaluateRule(rule, context)) {
        return { flagKey, value: rule.value, reason: 'rule_match', ruleIndex: i }
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashUserFlag(context.userId, flagKey)
      const bucket = hash % 100

      if (bucket >= flag.rolloutPercentage) {
        // User is outside rollout — return default
        return { flagKey, value: flag.defaultValue, reason: 'default' }
      }
      // User is within rollout — return the flag's non-default value
      return { flagKey, value: true, reason: 'rollout' }
    }

    // No rules matched, full rollout — return default
    return { flagKey, value: flag.defaultValue, reason: 'default' }
  }

  private evaluateRule(rule: EvaluationRule, context: EvaluationContext): boolean {
    // All conditions must match (AND logic)
    return rule.conditions.every(condition => this.evaluateCondition(condition, context))
  }

  private evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
    const actualValue = context.attributes[condition.attribute]

    if (actualValue === undefined) return false

    switch (condition.operator) {
      case 'eq':
        return String(actualValue) === String(condition.value)

      case 'neq':
        return String(actualValue) !== String(condition.value)

      case 'gt':
        return Number(actualValue) > Number(condition.value)

      case 'lt':
        return Number(actualValue) < Number(condition.value)

      case 'in':
        if (!Array.isArray(condition.value)) return false
        return condition.value.includes(String(actualValue))

      case 'contains':
        return String(actualValue).includes(String(condition.value))

      case 'regex':
        try {
          return new RegExp(String(condition.value)).test(String(actualValue))
        } catch {
          return false
        }

      default:
        return false
    }
  }

  private hashUserFlag(userId: string, flagKey: string): number {
    const str = `${userId}:${flagKey}`
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }
}

class FeatureFlagManager {
  private evaluator: FeatureFlagEvaluator
  private analyticsBuffer: Array<{ flagKey: string; result: EvaluationResult; timestamp: Date }> = []

  constructor() {
    this.evaluator = new FeatureFlagEvaluator()
  }

  async loadFlags(source: FlagSource): Promise<void> {
    const flags = await source.fetchFlags()
    for (const flag of flags) {
      this.evaluator.registerFlag(flag)
    }
  }

  isEnabled(flagKey: string, context: EvaluationContext): boolean {
    const result = this.evaluator.evaluate(flagKey, context)
    this.trackEvaluation(flagKey, result)
    return Boolean(result.value)
  }

  getValue(flagKey: string, context: EvaluationContext): FlagValue {
    const result = this.evaluator.evaluate(flagKey, context)
    this.trackEvaluation(flagKey, result)
    return result.value
  }

  private trackEvaluation(flagKey: string, result: EvaluationResult): void {
    this.analyticsBuffer.push({ flagKey, result, timestamp: new Date() })
    if (this.analyticsBuffer.length >= 100) {
      this.flushAnalytics()
    }
  }

  private async flushAnalytics(): Promise<void> {
    const batch = this.analyticsBuffer.splice(0, this.analyticsBuffer.length)
    // Send to analytics service
    console.log(`[FeatureFlags] Flushing ${batch.length} evaluation events`)
  }
}

interface FlagSource {
  fetchFlags(): Promise<FeatureFlag[]>
}

class RemoteFlagSource implements FlagSource {
  private endpoint: string
  private apiKey: string

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint
    this.apiKey = apiKey
  }

  async fetchFlags(): Promise<FeatureFlag[]> {
    const response = await fetch(this.endpoint, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    })
    if (!response.ok) throw new Error(`Failed to fetch flags: ${response.status}`)
    return response.json()
  }
}

class StaticFlagSource implements FlagSource {
  private flags: FeatureFlag[]

  constructor(flags: FeatureFlag[]) {
    this.flags = flags
  }

  async fetchFlags(): Promise<FeatureFlag[]> {
    return this.flags
  }
}

export { FeatureFlagEvaluator, FeatureFlagManager, RemoteFlagSource, StaticFlagSource }
export type { FeatureFlag, EvaluationRule, Condition, EvaluationContext, EvaluationResult, FlagSource }
