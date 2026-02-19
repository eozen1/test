interface ApiResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
}

class ApiClient {
  private baseUrl: string
  private token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl
    this.token = token
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    })
    const data = await res.json()
    return { data, status: res.status, headers: Object.fromEntries(res.headers) }
  }

  async post<T>(path: string, body: any): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return { data, status: res.status, headers: Object.fromEntries(res.headers) }
  }

  async delete(path: string): Promise<void> {
    await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    })
  }
}

// Rate limiter that tracks requests per window
class RateLimiter {
  private requests: number[] = []
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  canMakeRequest(): boolean {
    const now = Date.now()
    this.requests = this.requests.filter(t => now - t < this.windowMs)
    return this.requests.length < this.maxRequests
  }

  recordRequest(): void {
    this.requests.push(Date.now())
  }

  async waitForSlot(): Promise<void> {
    while (!this.canMakeRequest()) {
      await new Promise(r => setTimeout(r, 100))
    }
    this.recordRequest()
  }
}

async function batchFetch(urls: string[], concurrency: number = 5): Promise<any[]> {
  const results: any[] = []
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async url => {
        const res = await fetch(url)
        return res.json()
      })
    )
    results.push(...batchResults)
  }
  return results
}

function buildQueryString(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

export { ApiClient, RateLimiter, batchFetch, buildQueryString }
