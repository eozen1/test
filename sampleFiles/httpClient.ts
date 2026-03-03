interface RequestConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
  retries?: number
}

interface Response<T = unknown> {
  status: number
  data: T
  headers: Record<string, string>
  elapsed: number
}

class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public responseBody: string,
  ) {
    super(`HTTP ${status}: ${statusText}`)
    this.name = 'HttpError'
  }
}

class HttpClient {
  private baseUrl: string
  private defaultHeaders: Record<string, string>
  private defaultTimeout: number

  constructor(baseUrl: string, options: { headers?: Record<string, string>; timeout?: number } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
    this.defaultTimeout = options.timeout ?? 30000
  }

  async request<T>(config: RequestConfig): Promise<Response<T>> {
    const url = config.url.startsWith('http') ? config.url : `${this.baseUrl}${config.url}`
    const timeout = config.timeout ?? this.defaultTimeout
    const maxRetries = config.retries ?? 0

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeout)

        const start = Date.now()
        const response = await fetch(url, {
          method: config.method,
          headers: { ...this.defaultHeaders, ...config.headers },
          body: config.body ? JSON.stringify(config.body) : undefined,
          signal: controller.signal,
        })
        clearTimeout(timer)

        const elapsed = Date.now() - start
        const data = await response.json() as T

        if (!response.ok) {
          throw new HttpError(response.status, response.statusText, JSON.stringify(data))
        }

        return {
          status: response.status,
          data,
          headers: Object.fromEntries(response.headers.entries()),
          elapsed,
        }
      } catch (error) {
        lastError = error as Error
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 100
          await new Promise(resolve => setTimeout(resolve, backoff))
        }
      }
    }

    throw lastError!
  }

  async get<T>(url: string, headers?: Record<string, string>): Promise<Response<T>> {
    return this.request<T>({ url, method: 'GET', headers })
  }

  async post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<Response<T>> {
    return this.request<T>({ url, method: 'POST', body, headers })
  }

  async put<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<Response<T>> {
    return this.request<T>({ url, method: 'PUT', body, headers })
  }

  async delete<T>(url: string, headers?: Record<string, string>): Promise<Response<T>> {
    return this.request<T>({ url, method: 'DELETE', headers })
  }
}

// Request interceptor chain
type Interceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>

class InterceptorChain {
  private interceptors: Interceptor[] = []

  use(interceptor: Interceptor): number {
    this.interceptors.push(interceptor)
    return this.interceptors.length - 1
  }

  eject(index: number): void {
    this.interceptors[index] = (config) => config
  }

  async run(config: RequestConfig): Promise<RequestConfig> {
    let current = config
    for (const interceptor of this.interceptors) {
      current = await interceptor(current)
    }
    return current
  }
}

// Rate limiter for API calls
class RateLimiter {
  private tokens: number
  private maxTokens: number
  private refillRate: number
  private lastRefill: number

  constructor(requestsPerSecond: number) {
    this.maxTokens = requestsPerSecond
    this.tokens = requestsPerSecond
    this.refillRate = requestsPerSecond
    this.lastRefill = Date.now()
  }

  async acquire(): Promise<void> {
    this.refill()
    if (this.tokens <= 0) {
      const waitTime = (1 / this.refillRate) * 1000
      await new Promise(resolve => setTimeout(resolve, waitTime))
      this.refill()
    }
    this.tokens--
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }
}

export { HttpClient, HttpError, InterceptorChain, RateLimiter }
export type { RequestConfig, Response }
