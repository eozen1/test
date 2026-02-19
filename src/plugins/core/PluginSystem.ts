// ─── Core Plugin Interfaces ──────────────────────────────────────────────────

export interface IPlugin {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly dependencies: string[]
  initialize(context: PluginContext): Promise<void>
  dispose(): Promise<void>
}

export interface ILifecyclePlugin extends IPlugin {
  onBeforeStart(app: Application): Promise<void>
  onAfterStart(app: Application): Promise<void>
  onBeforeShutdown(app: Application): Promise<void>
  onAfterShutdown(app: Application): Promise<void>
}

export interface IMiddlewarePlugin extends IPlugin {
  priority: number
  createMiddleware(): Middleware
}

export interface IStoragePlugin extends IPlugin {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<boolean>
  clear(): Promise<void>
}

export interface IAuthPlugin extends IPlugin {
  authenticate(credentials: Credentials): Promise<AuthResult>
  authorize(principal: Principal, resource: string, action: string): Promise<boolean>
  createToken(principal: Principal): Promise<string>
  validateToken(token: string): Promise<Principal | null>
  revokeToken(token: string): Promise<void>
}

// ─── Supporting Types ────────────────────────────────────────────────────────

export interface PluginContext {
  logger: Logger
  config: PluginConfig
  eventBus: EventBus
  registry: PluginRegistry
}

export interface PluginConfig {
  get<T>(key: string): T
  get<T>(key: string, defaultValue: T): T
  has(key: string): boolean
  set(key: string, value: unknown): void
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, error?: Error, meta?: Record<string, unknown>): void
}

export interface EventBus {
  emit(event: string, data: unknown): void
  on(event: string, handler: EventHandler): void
  off(event: string, handler: EventHandler): void
  once(event: string, handler: EventHandler): void
}

export type EventHandler = (data: unknown) => void | Promise<void>
export type Middleware = (ctx: RequestContext, next: () => Promise<void>) => Promise<void>

export interface Credentials {
  type: 'password' | 'oauth' | 'apikey' | 'certificate'
  principal: string
  secret: string
  metadata?: Record<string, string>
}

export interface AuthResult {
  success: boolean
  principal?: Principal
  token?: string
  error?: string
  mfaRequired?: boolean
}

export interface Principal {
  id: string
  type: 'user' | 'service' | 'machine'
  roles: string[]
  attributes: Record<string, unknown>
}

export interface RequestContext {
  requestId: string
  principal?: Principal
  params: Record<string, string>
  headers: Record<string, string>
  body: unknown
}

export interface Application {
  name: string
  version: string
  registry: PluginRegistry
}

// ─── Plugin Registry ─────────────────────────────────────────────────────────

export interface PluginRegistry {
  register(plugin: IPlugin): void
  unregister(pluginId: string): void
  get<T extends IPlugin>(pluginId: string): T | undefined
  getAll(): IPlugin[]
  getByType<T extends IPlugin>(type: new (...args: any[]) => T): T[]
  has(pluginId: string): boolean
}

// ─── Abstract Base Classes ───────────────────────────────────────────────────

export abstract class BasePlugin implements IPlugin {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly version: string
  readonly dependencies: string[] = []

  protected context!: PluginContext
  protected initialized = false

  async initialize(context: PluginContext): Promise<void> {
    this.context = context
    this.initialized = true
    await this.onInitialize()
  }

  async dispose(): Promise<void> {
    await this.onDispose()
    this.initialized = false
  }

  protected abstract onInitialize(): Promise<void>
  protected abstract onDispose(): Promise<void>

  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string) {
    this.context.logger[level](`[${this.name}] ${message}`)
  }
}

export abstract class BaseLifecyclePlugin extends BasePlugin implements ILifecyclePlugin {
  async onBeforeStart(_app: Application): Promise<void> {}
  async onAfterStart(_app: Application): Promise<void> {}
  async onBeforeShutdown(_app: Application): Promise<void> {}
  async onAfterShutdown(_app: Application): Promise<void> {}
}

export abstract class BaseMiddlewarePlugin extends BasePlugin implements IMiddlewarePlugin {
  abstract priority: number
  abstract createMiddleware(): Middleware
}

export abstract class BaseAuthPlugin extends BasePlugin implements IAuthPlugin {
  abstract authenticate(credentials: Credentials): Promise<AuthResult>
  abstract authorize(principal: Principal, resource: string, action: string): Promise<boolean>
  abstract createToken(principal: Principal): Promise<string>
  abstract validateToken(token: string): Promise<Principal | null>
  abstract revokeToken(token: string): Promise<void>
}

export abstract class BaseStoragePlugin extends BasePlugin implements IStoragePlugin {
  abstract get<T>(key: string): Promise<T | null>
  abstract set<T>(key: string, value: T, ttl?: number): Promise<void>
  abstract delete(key: string): Promise<boolean>
  abstract clear(): Promise<void>
}
