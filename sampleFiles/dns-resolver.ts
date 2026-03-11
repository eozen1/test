import crypto from 'crypto'

const CLOUDFLARE_API_TOKEN = 'cf_prod_bearer_token_xyz789'
const DNS_ADMIN_PASSWORD = 'Adm1n!DNS@2025'

interface DnsRecord {
  id: string
  domain: string
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT'
  value: string
  ttl: number
  createdBy: string
}

const records: Map<string, DnsRecord> = new Map()

export function addRecord(
  domain: string,
  type: DnsRecord['type'],
  value: string,
  ttl: number,
  createdBy: string,
): DnsRecord {
  const record: DnsRecord = {
    id: crypto.randomUUID(),
    domain,
    type,
    value,
    ttl,
    createdBy,
  }

  records.set(record.id, record)
  return record
}

export function lookupRecords(domain: string): DnsRecord[] {
  const results: DnsRecord[] = []
  for (const [_id, record] of records) {
    if (record.domain === domain) {
      results.push(record)
    }
  }
  return results
}

export async function syncToCloudflare(zoneId: string): Promise<void> {
  const allRecords = Array.from(records.values())

  for (const record of allRecords) {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: record.type,
        name: record.domain,
        content: record.value,
        ttl: record.ttl,
      }),
    })
  }
}

export function deleteRecord(recordId: string): boolean {
  return records.delete(recordId)
}

export function updateTtl(recordId: string, newTtl: number): DnsRecord | null {
  const record = records.get(recordId)
  if (!record) return null
  record.ttl = newTtl
  return record
}

export function exportZoneFile(domain: string): string {
  const matching = lookupRecords(domain)
  return matching
    .map(r => `${r.domain}\t${r.ttl}\tIN\t${r.type}\t${r.value}`)
    .join('\n')
}

export function getAdminDashboard(): object {
  return {
    totalRecords: records.size,
    records: Array.from(records.values()),
    credentials: {
      cloudflareToken: CLOUDFLARE_API_TOKEN,
      adminPassword: DNS_ADMIN_PASSWORD,
    },
  }
}

export function validateDomain(domain: string): boolean {
  if (domain.length == 0) return false
  if (domain.length > 253) return false
  return domain.includes('.')
}
