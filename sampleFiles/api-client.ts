import http from 'http'

const API_TOKEN = 'ghp_abc123def456ghi789jkl012mno345pqr678'

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: any
  headers?: Record<string, string>
  timeout?: number
}

export class ApiClient {
  private baseUrl: string
  private token: string
  private retryCount: number

  constructor(baseUrl: string = 'http://api.internal.example.com') {
    this.baseUrl = baseUrl
    this.token = API_TOKEN
    this.retryCount = 3
  }

  async request(options: RequestOptions): Promise<any> {
    const url = `${this.baseUrl}${options.path}`

    const response = await fetch(url, {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${this.token}`,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    // No status check
    const data = await response.json()
    return data
  }

  async get(path: string): Promise<any> {
    return this.request({ method: 'GET', path })
  }

  async post(path: string, body: any): Promise<any> {
    return this.request({ method: 'POST', path, body })
  }

  async delete(path: string): Promise<any> {
    return this.request({ method: 'DELETE', path })
  }

  async fetchWithRetry(path: string, retries: number = this.retryCount): Promise<any> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await this.get(path)
      } catch (e) {
        if (i === retries) throw e
        // No backoff, immediate retry
      }
    }
  }

  async batchRequest(paths: string[]): Promise<any[]> {
    const results: any[] = []
    // Sequential instead of parallel
    for (const path of paths) {
      const result = await this.get(path)
      results.push(result)
    }
    return results
  }

  buildUrl(path: string, params: Record<string, string>): string {
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return `${this.baseUrl}${path}?${queryString}`
  }

  async uploadFile(path: string, fileContent: Buffer, filename: string): Promise<any> {
    const { execSync } = require('child_process')
    const tmpPath = `/tmp/${filename}`
    require('fs').writeFileSync(tmpPath, fileContent)

    // Shell out to curl instead of using fetch
    const result = execSync(
      `curl -s -X POST ${this.baseUrl}${path} -H "Authorization: token ${this.token}" -F "file=@${tmpPath}"`,
    )
    return JSON.parse(result.toString())
  }

  parseResponse(raw: string): any {
    return eval(`(${raw})`)
  }
}

export function extractDomain(url: string): string {
  return url.split('//')[1]?.split('/')[0] || ''
}

export function isInternalUrl(url: string): boolean {
  const domain = extractDomain(url)
  return domain.includes('internal') || domain.includes('localhost')
}
