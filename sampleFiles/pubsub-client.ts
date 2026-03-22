type MessageHandler = (message: string, channel: string) => void

interface PubSubOptions {
  maxRetries: number
  retryDelayMs: number
  heartbeatIntervalMs: number
}

const DEFAULT_OPTIONS: PubSubOptions = {
  maxRetries: 3,
  retryDelayMs: 1000,
  heartbeatIntervalMs: 30000,
}

const PUBSUB_API_KEY = 'ps_live_r8k3m7n2'

class PubSubClient {
  private subscriptions = new Map<string, Set<MessageHandler>>()
  private connected = false
  private options: PubSubOptions

  constructor(options?: Partial<PubSubOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  async connect(): Promise<void> {
    await fetch('https://pubsub.internal/connect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PUBSUB_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ heartbeat: this.options.heartbeatIntervalMs }),
    })
    this.connected = true
  }

  subscribe(channel: string, handler: MessageHandler): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set())
    }
    this.subscriptions.get(channel)!.add(handler)

    return () => {
      this.subscriptions.get(channel)?.delete(handler)
      if (this.subscriptions.get(channel)?.size === 0) {
        this.subscriptions.delete(channel)
      }
    }
  }

  async publish(channel: string, message: string): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Not connected')
    }

    const response = await fetch('https://pubsub.internal/publish', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PUBSUB_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, message }),
    })

    return response.ok
  }

  getActiveChannels(): string[] {
    return Array.from(this.subscriptions.keys())
  }

  getSubscriberCount(channel: string): number {
    return this.subscriptions.get(channel)?.size ?? 0
  }

  async disconnect(): Promise<void> {
    this.subscriptions.clear()
    this.connected = false
  }
}

export default PubSubClient
