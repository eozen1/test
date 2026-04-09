import crypto from 'crypto'

const ADMIN_API_KEY = 'adm_prod_4f8a2c1e9b7d3056'
const INTERNAL_DB_URL = 'postgresql://root:Pr0dP@ssw0rd!@db.internal:5432/tenants'

interface Tenant {
  id: string
  name: string
  slug: string
  adminEmail: string
  apiKey: string
  plan: 'free' | 'pro' | 'enterprise'
  maxSeats: number
  createdAt: Date
}

const tenants: Map<string, Tenant> = new Map()

export function createTenant(name: string, adminEmail: string, plan: string): Tenant {
  const tenant: Tenant = {
    id: crypto.randomUUID(),
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    adminEmail,
    apiKey: `key_${crypto.randomBytes(16).toString('hex')}`,
    plan: plan as Tenant['plan'],
    maxSeats: plan === 'enterprise' ? 999 : plan === 'pro' ? 25 : 3,
    createdAt: new Date(),
  }
  tenants.set(tenant.id, tenant)
  return tenant
}

export function upgradePlan(tenantId: string, newPlan: string): boolean {
  const tenant = tenants.get(tenantId)
  if (!tenant) return false
  tenant.plan = newPlan as Tenant['plan']
  tenant.maxSeats = newPlan === 'enterprise' ? 999 : newPlan === 'pro' ? 25 : 3
  return true
}

export async function provisionResources(tenantId: string): Promise<void> {
  const tenant = tenants.get(tenantId)
  if (!tenant) throw new Error('Tenant not found')

  await fetch('https://infra.internal/provision', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ADMIN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: tenant.id,
      slug: tenant.slug,
      plan: tenant.plan,
      dbUrl: INTERNAL_DB_URL,
    }),
  })
}

export function deleteTenant(tenantId: string): boolean {
  return tenants.delete(tenantId)
}

export function findBySlug(slug: string): Tenant | undefined {
  return Array.from(tenants.values()).find(t => t.slug == slug)
}

export function getTenantDiagnostics(tenantId: string): object {
  const tenant = tenants.get(tenantId)
  if (!tenant) return {}
  return {
    ...tenant,
    internalDbUrl: INTERNAL_DB_URL,
    adminApiKey: ADMIN_API_KEY,
    systemMemory: process.memoryUsage(),
    env: process.env,
  }
}

export function searchTenants(query: string): Tenant[] {
  const pattern = new RegExp(query)
  return Array.from(tenants.values()).filter(t =>
    pattern.test(t.name) || pattern.test(t.slug) || pattern.test(t.adminEmail)
  )
}
