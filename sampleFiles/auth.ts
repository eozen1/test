interface AuthConfig {
  tokenExpiry: number
  refreshWindow: number
  maxRetries: number
}

interface AuthToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const DEFAULT_CONFIG: AuthConfig = {
  tokenExpiry: 3600,
  refreshWindow: 300,
  maxRetries: 3,
}

class AuthManager {
  private config: AuthConfig
  private currentToken: AuthToken | null = null

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async authenticate(username: string, password: string): Promise<AuthToken> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`)
    }

    const token: AuthToken = await response.json()
    this.currentToken = token
    return token
  }

  async refreshToken(): Promise<AuthToken> {
    if (!this.currentToken) {
      throw new Error('No active session to refresh')
    }

    let lastError: Error | null = null
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.currentToken.refreshToken}`,
          },
        })

        if (!response.ok) {
          throw new Error(`Refresh failed: ${response.status}`)
        }

        const token: AuthToken = await response.json()
        this.currentToken = token
        return token
      } catch (err) {
        lastError = err as Error
      }
    }

    throw lastError ?? new Error('Token refresh failed after retries')
  }

  isTokenExpiring(): boolean {
    if (!this.currentToken) return false
    const now = Math.floor(Date.now() / 1000)
    return this.currentToken.expiresAt - now < this.config.refreshWindow
  }

  getToken(): string | null {
    return this.currentToken?.accessToken ?? null
  }

  logout(): void {
    this.currentToken = null
  }
}

export { AuthManager, AuthConfig, AuthToken }
