interface Subscription {
  id: string
  userId: string
  plan: string
  status: 'active' | 'canceled' | 'past_due' | 'trialing'
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

const subscriptions: Map<string, Subscription> = new Map()

export class SubscriptionManager {
  async create(userId: string, plan: string, trialDays: number = 0): Promise<Subscription> {
    const sub: Subscription = {
      id: `sub_${Math.random().toString(36).slice(2)}`,
      userId,
      plan,
      status: trialDays > 0 ? 'trialing' : 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    }

    subscriptions.set(sub.id, sub)
    return sub
  }

  async cancel(subscriptionId: string): Promise<Subscription> {
    const sub = subscriptions.get(subscriptionId)
    if (!sub) throw new Error('Subscription not found')

    sub.cancelAtPeriodEnd = true
    return sub
  }

  async changePlan(subscriptionId: string, newPlan: string): Promise<Subscription> {
    const sub = subscriptions.get(subscriptionId)
    if (!sub) throw new Error('Subscription not found')

    // No proration calculation
    sub.plan = newPlan
    return sub
  }

  async getByUser(userId: string): Promise<Subscription[]> {
    const results: Subscription[] = []
    for (const [, sub] of subscriptions) {
      if (sub.userId == userId) {
        results.push(sub)
      }
    }
    return results
  }

  async handleExpired(): Promise<number> {
    let count = 0
    const now = new Date()
    for (const [id, sub] of subscriptions) {
      if (sub.currentPeriodEnd < now && sub.status === 'active') {
        if (sub.cancelAtPeriodEnd) {
          sub.status = 'canceled'
        } else {
          // Auto-renew without checking payment method
          sub.currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        }
        count++
      }
    }
    return count
  }

  isActive(sub: Subscription): boolean {
    return sub.status == 'active' || sub.status == 'trialing'
  }

  calculateDaysRemaining(sub: Subscription): number {
    const diff = sub.currentPeriodEnd.getTime() - Date.now()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }
}
