/**
 * Event-driven middleware architecture.
 *
 * Hierarchy:
 *   IMiddleware (interface)
 *     ├─ BaseMiddleware (abstract)
 *     │    ├─ LoggingMiddleware
 *     │    ├─ AuthMiddleware
 *     │    ├─ RateLimitMiddleware
 *     │    ├─ CacheMiddleware
 *     │    └─ ValidationMiddleware
 *     └─ CompositeMiddleware (chain of responsibility)
 *
 *   IEventHandler<T> (generic interface)
 *     ├─ BaseEventHandler<T> (abstract)
 *     │    ├─ UserEventHandler
 *     │    ├─ OrderEventHandler
 *     │    ├─ PaymentEventHandler
 *     │    ├─ NotificationEventHandler
 *     │    └─ AuditEventHandler
 *     └─ RetryableEventHandler<T> (decorator)
 *
 *   IEventBus (interface)
 *     └─ EventBus (singleton)
 */

// ─── Event Types ─────────────────────────────────────────

export interface EventMetadata {
  id: string
  timestamp: Date
  source: string
  correlationId?: string
  causationId?: string
  version: number
}

export interface DomainEvent<T = unknown> {
  type: string
  payload: T
  metadata: EventMetadata
}

export type EventCallback<T = unknown> = (event: DomainEvent<T>) => Promise<void>

// ─── Middleware ───────────────────────────────────────────

export interface IMiddleware {
  name: string
  priority: number
  process(event: DomainEvent, next: () => Promise<void>): Promise<void>
  initialize(): Promise<void>
  shutdown(): Promise<void>
  isEnabled(): boolean
}

export abstract class BaseMiddleware implements IMiddleware {
  abstract name: string
  abstract priority: number
  protected enabled = true

  abstract process(event: DomainEvent, next: () => Promise<void>): Promise<void>

  async initialize(): Promise<void> {
    this.enabled = true
  }

  async shutdown(): Promise<void> {
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }
}

export class LoggingMiddleware extends BaseMiddleware {
  name = 'logging'
  priority = 1
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'

  constructor(logLevel?: 'debug' | 'info' | 'warn' | 'error') {
    super()
    if (logLevel) this.logLevel = logLevel
  }

  async process(event: DomainEvent, next: () => Promise<void>): Promise<void> {
    const start = performance.now()
    console.log(`[${this.logLevel}] Event received: ${event.type} (${event.metadata.id})`)
    try {
      await next()
      const duration = performance.now() - start
      console.log(`[${this.logLevel}] Event processed: ${event.type} in ${duration.toFixed(2)}ms`)
    } catch (err) {
      const duration = performance.now() - start
      console.error(`[error] Event failed: ${event.type} after ${duration.toFixed(2)}ms`, err)
      throw err
    }
  }
}

export class AuthMiddleware extends BaseMiddleware {
  name = 'auth'
  priority = 2
  private allowedSources: Set<string>
  private tokenValidator: (token: string) => Promise<boolean>

  constructor(
    allowedSources: string[],
    tokenValidator: (token: string) => Promise<boolean>
  ) {
    super()
    this.allowedSources = new Set(allowedSources)
    this.tokenValidator = tokenValidator
  }

  async process(event: DomainEvent, next: () => Promise<void>): Promise<void> {
    if (!this.allowedSources.has(event.metadata.source)) {
      throw new Error(`Unauthorized event source: ${event.metadata.source}`)
    }
    const token = (event.payload as Record<string, unknown>)?.__authToken as string | undefined
    if (token && !(await this.tokenValidator(token))) {
      throw new Error('Invalid authentication token')
    }
    await next()
  }
}

export class RateLimitMiddleware extends BaseMiddleware {
  name = 'rateLimit'
  priority = 3
  private counts = new Map<string, { count: number; resetAt: number }>()
  private maxPerWindow: number
  private windowMs: number

  constructor(maxPerWindow = 100, windowMs = 60_000) {
    super()
    this.maxPerWindow = maxPerWindow
    this.windowMs = windowMs
  }

  async process(event: DomainEvent, next: () => Promise<void>): Promise<void> {
    const key = `${event.metadata.source}:${event.type}`
    const now = Date.now()
    const entry = this.counts.get(key)

    if (!entry || now > entry.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + this.windowMs })
    } else {
      entry.count++
      if (entry.count > this.maxPerWindow) {
        throw new Error(`Rate limit exceeded for ${key}: ${entry.count}/${this.maxPerWindow}`)
      }
    }
    await next()
  }
}

export class CacheMiddleware extends BaseMiddleware {
  name = 'cache'
  priority = 4
  private cache = new Map<string, { result: unknown; expiresAt: number }>()
  private ttlMs: number
  private cacheableTypes: Set<string>

  constructor(cacheableTypes: string[], ttlMs = 30_000) {
    super()
    this.cacheableTypes = new Set(cacheableTypes)
    this.ttlMs = ttlMs
  }

  async process(event: DomainEvent, next: () => Promise<void>): Promise<void> {
    if (!this.cacheableTypes.has(event.type)) {
      return next()
    }
    const cacheKey = `${event.type}:${JSON.stringify(event.payload)}`
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return // Cache hit, skip processing
    }
    await next()
    this.cache.set(cacheKey, { result: null, expiresAt: Date.now() + this.ttlMs })
  }

  async shutdown(): Promise<void> {
    this.cache.clear()
    await super.shutdown()
  }
}

export class ValidationMiddleware extends BaseMiddleware {
  name = 'validation'
  priority = 5
  private validators = new Map<string, (payload: unknown) => string | null>()

  registerValidator(eventType: string, validator: (payload: unknown) => string | null): void {
    this.validators.set(eventType, validator)
  }

  async process(event: DomainEvent, next: () => Promise<void>): Promise<void> {
    const validator = this.validators.get(event.type)
    if (validator) {
      const error = validator(event.payload)
      if (error) {
        throw new Error(`Validation failed for ${event.type}: ${error}`)
      }
    }
    await next()
  }
}

export class CompositeMiddleware implements IMiddleware {
  name = 'composite'
  priority = 0
  private middlewares: IMiddleware[] = []

  add(middleware: IMiddleware): this {
    this.middlewares.push(middleware)
    this.middlewares.sort((a, b) => a.priority - b.priority)
    return this
  }

  remove(name: string): boolean {
    const idx = this.middlewares.findIndex((m) => m.name === name)
    if (idx !== -1) {
      this.middlewares.splice(idx, 1)
      return true
    }
    return false
  }

  async process(event: DomainEvent, next: () => Promise<void>): Promise<void> {
    const active = this.middlewares.filter((m) => m.isEnabled())
    let idx = 0
    const executeNext = async (): Promise<void> => {
      if (idx < active.length) {
        const current = active[idx++]
        await current.process(event, executeNext)
      } else {
        await next()
      }
    }
    await executeNext()
  }

  async initialize(): Promise<void> {
    await Promise.all(this.middlewares.map((m) => m.initialize()))
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.middlewares.map((m) => m.shutdown()))
  }

  isEnabled(): boolean {
    return true
  }
}

// ─── Event Handlers ──────────────────────────────────────

export interface IEventHandler<T = unknown> {
  eventType: string
  handle(event: DomainEvent<T>): Promise<void>
  canHandle(event: DomainEvent): boolean
  onError(event: DomainEvent<T>, error: Error): Promise<void>
  getMetrics(): HandlerMetrics
}

export interface HandlerMetrics {
  totalProcessed: number
  totalErrors: number
  averageDurationMs: number
  lastProcessedAt?: Date
}

export abstract class BaseEventHandler<T = unknown> implements IEventHandler<T> {
  abstract eventType: string
  protected metrics: HandlerMetrics = {
    totalProcessed: 0,
    totalErrors: 0,
    averageDurationMs: 0,
  }

  abstract handle(event: DomainEvent<T>): Promise<void>

  canHandle(event: DomainEvent): boolean {
    return event.type === this.eventType
  }

  async onError(event: DomainEvent<T>, error: Error): Promise<void> {
    this.metrics.totalErrors++
    console.error(`Handler ${this.eventType} error:`, error.message)
  }

  getMetrics(): HandlerMetrics {
    return { ...this.metrics }
  }

  protected recordSuccess(durationMs: number): void {
    this.metrics.totalProcessed++
    this.metrics.averageDurationMs =
      (this.metrics.averageDurationMs * (this.metrics.totalProcessed - 1) + durationMs) /
      this.metrics.totalProcessed
    this.metrics.lastProcessedAt = new Date()
  }
}

// ─── Concrete Handlers ──────────────────────────────────

interface UserPayload {
  userId: string
  email: string
  action: 'created' | 'updated' | 'deleted' | 'suspended'
}

export class UserEventHandler extends BaseEventHandler<UserPayload> {
  eventType = 'user.*'

  async handle(event: DomainEvent<UserPayload>): Promise<void> {
    const start = performance.now()
    const { userId, action } = event.payload
    switch (action) {
      case 'created':
        await this.onUserCreated(userId, event.payload.email)
        break
      case 'updated':
        await this.onUserUpdated(userId)
        break
      case 'deleted':
        await this.onUserDeleted(userId)
        break
      case 'suspended':
        await this.onUserSuspended(userId)
        break
    }
    this.recordSuccess(performance.now() - start)
  }

  private async onUserCreated(userId: string, email: string): Promise<void> {
    console.log(`User created: ${userId} (${email})`)
  }
  private async onUserUpdated(userId: string): Promise<void> {
    console.log(`User updated: ${userId}`)
  }
  private async onUserDeleted(userId: string): Promise<void> {
    console.log(`User deleted: ${userId}`)
  }
  private async onUserSuspended(userId: string): Promise<void> {
    console.log(`User suspended: ${userId}`)
  }

  canHandle(event: DomainEvent): boolean {
    return event.type.startsWith('user.')
  }
}

interface OrderPayload {
  orderId: string
  customerId: string
  total: number
  items: Array<{ sku: string; qty: number; price: number }>
}

export class OrderEventHandler extends BaseEventHandler<OrderPayload> {
  eventType = 'order.*'

  async handle(event: DomainEvent<OrderPayload>): Promise<void> {
    const start = performance.now()
    const { orderId, total, items } = event.payload
    console.log(`Processing order ${orderId}: ${items.length} items, total $${total}`)
    // Validate inventory, calculate tax, reserve stock
    for (const item of items) {
      await this.reserveStock(item.sku, item.qty)
    }
    this.recordSuccess(performance.now() - start)
  }

  private async reserveStock(sku: string, qty: number): Promise<void> {
    console.log(`Reserved ${qty}x ${sku}`)
  }

  canHandle(event: DomainEvent): boolean {
    return event.type.startsWith('order.')
  }
}

interface PaymentPayload {
  transactionId: string
  orderId: string
  amount: number
  currency: string
  method: string
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded'
}

export class PaymentEventHandler extends BaseEventHandler<PaymentPayload> {
  eventType = 'payment.*'

  async handle(event: DomainEvent<PaymentPayload>): Promise<void> {
    const start = performance.now()
    const { transactionId, amount, status } = event.payload
    console.log(`Payment ${transactionId}: ${status} ($${amount})`)
    if (status === 'failed') {
      await this.handleFailedPayment(event.payload)
    }
    this.recordSuccess(performance.now() - start)
  }

  private async handleFailedPayment(payload: PaymentPayload): Promise<void> {
    console.error(`Payment failed for order ${payload.orderId}`)
  }

  canHandle(event: DomainEvent): boolean {
    return event.type.startsWith('payment.')
  }
}

interface NotificationPayload {
  recipientId: string
  channel: 'email' | 'sms' | 'push' | 'webhook'
  template: string
  data: Record<string, unknown>
}

export class NotificationEventHandler extends BaseEventHandler<NotificationPayload> {
  eventType = 'notification.*'

  async handle(event: DomainEvent<NotificationPayload>): Promise<void> {
    const start = performance.now()
    const { recipientId, channel, template } = event.payload
    console.log(`Sending ${channel} notification to ${recipientId} using template ${template}`)
    this.recordSuccess(performance.now() - start)
  }

  canHandle(event: DomainEvent): boolean {
    return event.type.startsWith('notification.')
  }
}

interface AuditPayload {
  actor: string
  action: string
  resource: string
  resourceId: string
  changes?: Record<string, { old: unknown; new: unknown }>
  ipAddress?: string
}

export class AuditEventHandler extends BaseEventHandler<AuditPayload> {
  eventType = 'audit.*'
  private auditLog: AuditPayload[] = []

  async handle(event: DomainEvent<AuditPayload>): Promise<void> {
    const start = performance.now()
    this.auditLog.push(event.payload)
    console.log(`Audit: ${event.payload.actor} ${event.payload.action} ${event.payload.resource}/${event.payload.resourceId}`)
    this.recordSuccess(performance.now() - start)
  }

  canHandle(event: DomainEvent): boolean {
    return event.type.startsWith('audit.')
  }

  getAuditLog(): AuditPayload[] {
    return [...this.auditLog]
  }
}

// ─── Retry Decorator ─────────────────────────────────────

export class RetryableEventHandler<T> implements IEventHandler<T> {
  eventType: string
  private maxRetries: number
  private backoffMs: number

  constructor(
    private inner: IEventHandler<T>,
    maxRetries = 3,
    backoffMs = 1000
  ) {
    this.eventType = inner.eventType
    this.maxRetries = maxRetries
    this.backoffMs = backoffMs
  }

  async handle(event: DomainEvent<T>): Promise<void> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.inner.handle(event)
        return
      } catch (err) {
        lastError = err as Error
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, this.backoffMs * Math.pow(2, attempt)))
        }
      }
    }
    throw lastError
  }

  canHandle(event: DomainEvent): boolean {
    return this.inner.canHandle(event)
  }

  async onError(event: DomainEvent<T>, error: Error): Promise<void> {
    await this.inner.onError(event, error)
  }

  getMetrics(): HandlerMetrics {
    return this.inner.getMetrics()
  }
}

// ─── Event Bus ───────────────────────────────────────────

export interface IEventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>
  subscribe<T>(handler: IEventHandler<T>): void
  unsubscribe(eventType: string): void
  addMiddleware(middleware: IMiddleware): void
  getHandlerMetrics(): Map<string, HandlerMetrics>
  shutdown(): Promise<void>
}

export class EventBus implements IEventBus {
  private static instance: EventBus
  private handlers = new Map<string, IEventHandler[]>()
  private middleware = new CompositeMiddleware()
  private deadLetterQueue: Array<{ event: DomainEvent; error: Error; timestamp: Date }> = []

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    await this.middleware.process(event as DomainEvent, async () => {
      const matchingHandlers = this.findHandlers(event)
      await Promise.allSettled(
        matchingHandlers.map(async (handler) => {
          try {
            await handler.handle(event)
          } catch (err) {
            await handler.onError(event, err as Error)
            this.deadLetterQueue.push({
              event: event as DomainEvent,
              error: err as Error,
              timestamp: new Date(),
            })
          }
        })
      )
    })
  }

  subscribe<T>(handler: IEventHandler<T>): void {
    const existing = this.handlers.get(handler.eventType) || []
    existing.push(handler as IEventHandler)
    this.handlers.set(handler.eventType, existing)
  }

  unsubscribe(eventType: string): void {
    this.handlers.delete(eventType)
  }

  addMiddleware(middleware: IMiddleware): void {
    this.middleware.add(middleware)
  }

  getHandlerMetrics(): Map<string, HandlerMetrics> {
    const metrics = new Map<string, HandlerMetrics>()
    for (const [type, handlers] of this.handlers) {
      for (const handler of handlers) {
        metrics.set(`${type}:${handler.constructor.name}`, handler.getMetrics())
      }
    }
    return metrics
  }

  getDeadLetterQueue() {
    return [...this.deadLetterQueue]
  }

  async shutdown(): Promise<void> {
    await this.middleware.shutdown()
    this.handlers.clear()
  }

  private findHandlers(event: DomainEvent): IEventHandler[] {
    const results: IEventHandler[] = []
    for (const [, handlers] of this.handlers) {
      for (const handler of handlers) {
        if (handler.canHandle(event)) {
          results.push(handler)
        }
      }
    }
    return results
  }
}
