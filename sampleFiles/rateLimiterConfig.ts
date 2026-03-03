import { checkRateLimit, resetLimit } from './rateLimiter'

interface TierConfig {
  name: string
  maxRequests: number
  windowMs: number
}

const tierConfigs: TierConfig[] = [
  { name: 'free', maxRequests: 10, windowMs: 60000 },
  { name: 'pro', maxRequests: 500, windowMs: 60000 },
  { name: 'enterprise', maxRequests: 10000, windowMs: 60000 },
]

const clientTiers: Record<string, string> = {}

export function assignTier(clientId: string, tierName: string) {
  clientTiers[clientId] = tierName
}

export function checkWithTier(clientId: string): boolean {
  const tierName = clientTiers[clientId] || 'free'
  const tier = tierConfigs.find(t => t.name === tierName)
  if (!tier) return false
  return checkRateLimit(clientId, tier.maxRequests, tier.windowMs)
}

export function upgradeClient(clientId: string, newTier: string) {
  clientTiers[clientId] = newTier
  resetLimit(clientId)
}

export function getClientTier(clientId: string): string {
  return clientTiers[clientId] || 'free'
}

export function addCustomTier(name: string, maxRequests: number, windowMs: number) {
  tierConfigs.push({ name, maxRequests, windowMs })
}

export function listTiers(): TierConfig[] {
  return tierConfigs
}
