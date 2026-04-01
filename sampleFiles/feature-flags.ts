/**
 * Feature flag evaluation engine with multi-condition support.
 * Evaluates flags based on user attributes, percentages, and environment rules.
 */

interface UserContext {
  userId: string
  email: string
  plan: 'free' | 'pro' | 'enterprise'
  country: string
  signupDate: Date
  attributes: Record<string, string | number | boolean>
}

interface FlagCondition {
  type: 'user_id' | 'email_domain' | 'plan' | 'country' | 'attribute' | 'percentage' | 'date_after'
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'greater_than' | 'less_than'
  value: string | string[] | number | boolean
  attributeKey?: string
}

interface FeatureFlag {
  key: string
  enabled: boolean
  conditions: FlagCondition[]
  conditionLogic: 'all' | 'any'
  rolloutPercentage: number
  overrides: Map<string, boolean>
  metadata: {
    description: string
    owner: string
    createdAt: Date
    expiresAt?: Date
  }
}

interface EvaluationResult {
  enabled: boolean
  reason: string
  flagKey: string
  evaluatedAt: Date
}

class FeatureFlagEvaluator {
  private flags: Map<string, FeatureFlag> = new Map()
  private evaluationLog: EvaluationResult[] = []

  registerFlag(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag)
  }

  /**
   * Evaluate whether a feature flag is enabled for the given user context.
   *
   * Evaluation order:
   * 1. Check if flag exists → disabled if not found
   * 2. Check if flag is globally disabled → return false
   * 3. Check if flag has expired → return false
   * 4. Check user-specific overrides → return override value
   * 5. Check rollout percentage → return false if user not in rollout
   * 6. Evaluate conditions based on conditionLogic (all/any)
   */
  evaluate(flagKey: string, user: UserContext): EvaluationResult {
    const flag = this.flags.get(flagKey)

    // Step 1: Flag existence check
    if (!flag) {
      return this.logResult(flagKey, false, 'Flag not found')
    }

    // Step 2: Global kill switch
    if (!flag.enabled) {
      return this.logResult(flagKey, false, 'Flag globally disabled')
    }

    // Step 3: Expiration check
    if (flag.metadata.expiresAt && flag.metadata.expiresAt < new Date()) {
      return this.logResult(flagKey, false, 'Flag expired')
    }

    // Step 4: User override
    if (flag.overrides.has(user.userId)) {
      const overrideValue = flag.overrides.get(user.userId)!
      return this.logResult(flagKey, overrideValue, `User override: ${overrideValue}`)
    }

    // Step 5: Rollout percentage
    if (flag.rolloutPercentage < 100) {
      const userHash = this.hashUserId(user.userId, flagKey)
      const userPercentile = userHash % 100

      if (userPercentile >= flag.rolloutPercentage) {
        return this.logResult(flagKey, false, `Outside rollout (${userPercentile}% >= ${flag.rolloutPercentage}%)`)
      }
    }

    // Step 6: Condition evaluation
    if (flag.conditions.length === 0) {
      return this.logResult(flagKey, true, 'No conditions, flag enabled')
    }

    const conditionResults = flag.conditions.map((condition) => this.evaluateCondition(condition, user))

    let enabled: boolean
    if (flag.conditionLogic === 'all') {
      enabled = conditionResults.every((r) => r)
    } else {
      enabled = conditionResults.some((r) => r)
    }

    const passedCount = conditionResults.filter((r) => r).length
    const reason = `${flag.conditionLogic === 'all' ? 'All' : 'Any'} conditions: ${passedCount}/${flag.conditions.length} passed`

    return this.logResult(flagKey, enabled, reason)
  }

  /**
   * Evaluate a single condition against user context.
   * Each condition type extracts the relevant value from the user
   * and applies the specified operator.
   */
  private evaluateCondition(condition: FlagCondition, user: UserContext): boolean {
    switch (condition.type) {
      case 'user_id':
        return this.applyOperator(user.userId, condition.operator, condition.value)

      case 'email_domain': {
        const domain = user.email.split('@')[1]
        return this.applyOperator(domain, condition.operator, condition.value)
      }

      case 'plan':
        return this.applyOperator(user.plan, condition.operator, condition.value)

      case 'country':
        return this.applyOperator(user.country, condition.operator, condition.value)

      case 'attribute': {
        if (!condition.attributeKey) return false
        const attrValue = user.attributes[condition.attributeKey]
        if (attrValue === undefined) return false
        return this.applyOperator(attrValue, condition.operator, condition.value)
      }

      case 'date_after': {
        const targetDate = new Date(condition.value as string)
        return user.signupDate >= targetDate
      }

      case 'percentage':
        // Handled at flag level, always passes here
        return true

      default:
        return false
    }
  }

  private applyOperator(
    actual: string | number | boolean,
    operator: FlagCondition['operator'],
    expected: FlagCondition['value'],
  ): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected
      case 'not_equals':
        return actual !== expected
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
      case 'in':
        return Array.isArray(expected) && expected.includes(String(actual))
      case 'greater_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected
      case 'less_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected
      default:
        return false
    }
  }

  /**
   * Deterministic hash for consistent percentage rollout.
   * Ensures the same user always gets the same rollout decision for a given flag.
   */
  private hashUserId(userId: string, flagKey: string): number {
    const combined = `${userId}:${flagKey}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    return Math.abs(hash)
  }

  private logResult(flagKey: string, enabled: boolean, reason: string): EvaluationResult {
    const result: EvaluationResult = {
      enabled,
      reason,
      flagKey,
      evaluatedAt: new Date(),
    }
    this.evaluationLog.push(result)
    return result
  }

  getEvaluationLog(): readonly EvaluationResult[] {
    return this.evaluationLog
  }

  clearLog(): void {
    this.evaluationLog = []
  }
}

export { FeatureFlagEvaluator, type FeatureFlag, type FlagCondition, type UserContext, type EvaluationResult }
