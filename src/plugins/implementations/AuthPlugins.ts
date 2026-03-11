import {
  BaseAuthPlugin,
  type Credentials,
  type AuthResult,
  type Principal,
  type IStoragePlugin,
} from '../core/PluginSystem'

// ─── JWT Auth Plugin ─────────────────────────────────────────────────────────

export class JwtAuthPlugin extends BaseAuthPlugin {
  readonly id = 'auth-jwt'
  readonly name = 'JWT Authentication'
  readonly version = '2.1.0'
  readonly dependencies = ['storage-redis']

  private secret!: string
  private issuer!: string
  private tokenExpiry!: number
  private storage!: IStoragePlugin

  protected async onInitialize(): Promise<void> {
    this.secret = this.context.config.get<string>('jwt.secret')
    this.issuer = this.context.config.get<string>('jwt.issuer', 'app')
    this.tokenExpiry = this.context.config.get<number>('jwt.expirySeconds', 3600)
    this.storage = this.context.registry.get<IStoragePlugin>('storage-redis')!

    this.context.eventBus.on('user.password_changed', async (data) => {
      const { userId } = data as { userId: string }
      await this.revokeAllUserTokens(userId)
    })

    this.log('info', `Initialized with issuer=${this.issuer}, expiry=${this.tokenExpiry}s`)
  }

  protected async onDispose(): Promise<void> {
    this.context.eventBus.off('user.password_changed', () => {})
  }

  async authenticate(credentials: Credentials): Promise<AuthResult> {
    if (credentials.type !== 'password') {
      return { success: false, error: 'JWT plugin only supports password authentication' }
    }

    // Delegate actual password verification to user store
    const verified = await this.verifyPassword(credentials.principal, credentials.secret)
    if (!verified) {
      return { success: false, error: 'Invalid credentials' }
    }

    const principal = await this.loadPrincipal(credentials.principal)
    if (!principal) {
      return { success: false, error: 'User not found' }
    }

    // Check if MFA is required
    if (principal.attributes.mfaEnabled) {
      return { success: false, mfaRequired: true, principal }
    }

    const token = await this.createToken(principal)
    return { success: true, principal, token }
  }

  async authorize(principal: Principal, resource: string, action: string): Promise<boolean> {
    // Check role-based permissions
    const permissions = await this.storage.get<string[]>(`permissions:${principal.id}`)
    if (!permissions) return false

    const required = `${resource}:${action}`
    return permissions.includes(required) || permissions.includes(`${resource}:*`) || permissions.includes('*:*')
  }

  async createToken(principal: Principal): Promise<string> {
    const payload = {
      sub: principal.id,
      type: principal.type,
      roles: principal.roles,
      iss: this.issuer,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.tokenExpiry,
    }
    const token = this.signJwt(payload)

    // Track active tokens
    await this.storage.set(`token:${token}`, { principalId: principal.id, issuedAt: new Date() }, this.tokenExpiry)

    return token
  }

  async validateToken(token: string): Promise<Principal | null> {
    // Check if token is revoked
    const tokenData = await this.storage.get<{ principalId: string }>(`token:${token}`)
    if (!tokenData) return null

    try {
      const payload = this.verifyJwt(token)
      return this.loadPrincipal(payload.sub)
    } catch {
      return null
    }
  }

  async revokeToken(token: string): Promise<void> {
    await this.storage.delete(`token:${token}`)
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    // In production, you'd scan for all tokens belonging to this user
    this.log('info', `Revoking all tokens for user ${userId}`)
  }

  private async verifyPassword(_principal: string, _secret: string): Promise<boolean> {
    // Stub — in production, delegates to user store + bcrypt
    return true
  }

  private async loadPrincipal(id: string): Promise<Principal | null> {
    return this.storage.get<Principal>(`principal:${id}`)
  }

  private signJwt(_payload: Record<string, unknown>): string {
    // Stub — in production, uses jsonwebtoken
    return `jwt_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }

  private verifyJwt(_token: string): { sub: string; roles: string[] } {
    // Stub
    return { sub: 'user_1', roles: ['admin'] }
  }
}

// ─── OAuth Auth Plugin ───────────────────────────────────────────────────────

export class OAuthPlugin extends BaseAuthPlugin {
  readonly id = 'auth-oauth'
  readonly name = 'OAuth 2.0 Authentication'
  readonly version = '1.4.0'
  readonly dependencies = ['auth-jwt', 'storage-redis']

  private providers: Map<string, OAuthProviderConfig> = new Map()
  private jwtPlugin!: JwtAuthPlugin

  protected async onInitialize(): Promise<void> {
    this.jwtPlugin = this.context.registry.get<JwtAuthPlugin>('auth-jwt')!

    const providerConfigs = this.context.config.get<OAuthProviderConfig[]>('oauth.providers', [])
    for (const config of providerConfigs) {
      this.providers.set(config.name, config)
    }

    this.log('info', `Initialized with ${this.providers.size} OAuth providers`)
  }

  protected async onDispose(): Promise<void> {
    this.providers.clear()
  }

  async authenticate(credentials: Credentials): Promise<AuthResult> {
    if (credentials.type !== 'oauth') {
      return { success: false, error: 'OAuth plugin only supports OAuth authentication' }
    }

    const provider = this.providers.get(credentials.metadata?.provider ?? '')
    if (!provider) {
      return { success: false, error: `Unknown OAuth provider: ${credentials.metadata?.provider}` }
    }

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCode(provider, credentials.secret)
    if (!tokenResponse) {
      return { success: false, error: 'OAuth token exchange failed' }
    }

    // Fetch user profile from provider
    const profile = await this.fetchUserProfile(provider, tokenResponse.accessToken)
    if (!profile) {
      return { success: false, error: 'Failed to fetch user profile' }
    }

    // Find or create local user, then issue JWT
    const principal = await this.findOrCreateUser(profile, provider.name)
    const token = await this.jwtPlugin.createToken(principal)

    this.context.eventBus.emit('user.oauth_login', {
      principalId: principal.id,
      provider: provider.name,
    })

    return { success: true, principal, token }
  }

  async authorize(principal: Principal, resource: string, action: string): Promise<boolean> {
    return this.jwtPlugin.authorize(principal, resource, action)
  }

  async createToken(principal: Principal): Promise<string> {
    return this.jwtPlugin.createToken(principal)
  }

  async validateToken(token: string): Promise<Principal | null> {
    return this.jwtPlugin.validateToken(token)
  }

  async revokeToken(token: string): Promise<void> {
    return this.jwtPlugin.revokeToken(token)
  }

  private async exchangeCode(
    _provider: OAuthProviderConfig,
    _code: string,
  ): Promise<OAuthTokenResponse | null> {
    // Stub
    return { accessToken: 'oauth_access_token', refreshToken: 'oauth_refresh_token', expiresIn: 3600 }
  }

  private async fetchUserProfile(
    _provider: OAuthProviderConfig,
    _accessToken: string,
  ): Promise<OAuthUserProfile | null> {
    // Stub
    return { id: 'oauth_user_1', email: 'user@example.com', name: 'Test User', avatarUrl: null }
  }

  private async findOrCreateUser(_profile: OAuthUserProfile, _provider: string): Promise<Principal> {
    // Stub
    return { id: 'user_1', type: 'user', roles: ['member'], attributes: {} }
  }
}

// ─── API Key Auth Plugin ─────────────────────────────────────────────────────

export class ApiKeyAuthPlugin extends BaseAuthPlugin {
  readonly id = 'auth-apikey'
  readonly name = 'API Key Authentication'
  readonly version = '1.2.0'
  readonly dependencies = ['storage-redis']

  private storage!: IStoragePlugin

  protected async onInitialize(): Promise<void> {
    this.storage = this.context.registry.get<IStoragePlugin>('storage-redis')!
    this.log('info', 'API Key auth initialized')
  }

  protected async onDispose(): Promise<void> {}

  async authenticate(credentials: Credentials): Promise<AuthResult> {
    if (credentials.type !== 'apikey') {
      return { success: false, error: 'API Key plugin only supports apikey authentication' }
    }

    const keyData = await this.storage.get<StoredApiKey>(`apikey:${this.hashKey(credentials.secret)}`)
    if (!keyData) {
      return { success: false, error: 'Invalid API key' }
    }

    if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
      return { success: false, error: 'API key expired' }
    }

    if (keyData.revokedAt) {
      return { success: false, error: 'API key revoked' }
    }

    const principal: Principal = {
      id: keyData.ownerId,
      type: 'service',
      roles: keyData.scopes,
      attributes: { apiKeyId: keyData.id, orgId: keyData.organizationId },
    }

    // Update last used timestamp
    await this.storage.set(`apikey:${this.hashKey(credentials.secret)}`, {
      ...keyData,
      lastUsedAt: new Date().toISOString(),
    })

    return { success: true, principal }
  }

  async authorize(principal: Principal, resource: string, action: string): Promise<boolean> {
    const required = `${resource}:${action}`
    return principal.roles.includes(required) || principal.roles.includes(`${resource}:*`)
  }

  async createToken(_principal: Principal): Promise<string> {
    throw new Error('API Key plugin does not issue tokens — use the key directly')
  }

  async validateToken(_token: string): Promise<Principal | null> {
    return null
  }

  async revokeToken(_token: string): Promise<void> {
    throw new Error('Use revokeKey() instead')
  }

  async revokeKey(keyHash: string): Promise<void> {
    const keyData = await this.storage.get<StoredApiKey>(`apikey:${keyHash}`)
    if (keyData) {
      await this.storage.set(`apikey:${keyHash}`, { ...keyData, revokedAt: new Date().toISOString() })
    }
  }

  private hashKey(key: string): string {
    // Stub — in production, use SHA-256
    return `hash_${key.slice(0, 8)}`
  }
}

// ─── Supporting Types ────────────────────────────────────────────────────────

interface OAuthProviderConfig {
  name: string
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string[]
}

interface OAuthTokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

interface OAuthUserProfile {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

interface StoredApiKey {
  id: string
  ownerId: string
  organizationId: string
  scopes: string[]
  expiresAt?: string
  revokedAt?: string
  lastUsedAt?: string
}
