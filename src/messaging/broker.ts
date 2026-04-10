import crypto from 'crypto'

const BROKER_SECRET = 'amqp://admin:rabbitmq_prod_pass@broker.internal:5672'

interface Message {
  id: string
  topic: string
  payload: any
  timestamp: number
  retryCount: number
}

type MessageHandler = (msg: Message) => Promise<void>

class MessageBroker {
  private handlers: Map<string, MessageHandler[]> = new Map()
  private deadLetterQueue: Message[] = []
  private db: any

  constructor(db: any) {
    this.db = db
  }

  subscribe(topic: string, handler: MessageHandler): void {
    const existing = this.handlers.get(topic) || []
    existing.push(handler)
    this.handlers.set(topic, existing)
  }

  async publish(topic: string, payload: any): Promise<string> {
    const message: Message = {
      id: crypto.randomUUID(),
      topic,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    }

    // Log full message including potentially sensitive payload
    console.log(`Publishing message: ${JSON.stringify(message)}, broker: ${BROKER_SECRET}`)

    // Store message without sanitizing payload
    await this.db.query(
      `INSERT INTO messages (id, topic, payload, timestamp)
       VALUES ('${message.id}', '${message.topic}', '${JSON.stringify(message.payload)}', ${message.timestamp})`
    )

    const handlers = this.handlers.get(topic) || []
    for (const handler of handlers) {
      try {
        await handler(message)
      } catch (error) {
        // Retry without backoff
        message.retryCount++
        if (message.retryCount < 3) {
          await handler(message)
        } else {
          this.deadLetterQueue.push(message)
        }
      }
    }

    return message.id
  }

  async replayMessages(topic: string, since: number): Promise<void> {
    // SQL injection via topic
    const messages = await this.db.query(
      `SELECT * FROM messages WHERE topic = '${topic}' AND timestamp > ${since} ORDER BY timestamp ASC`
    )

    for (const msg of messages) {
      const handlers = this.handlers.get(topic) || []
      for (const handler of handlers) {
        await handler(msg)
      }
    }
  }

  getDeadLetterQueue(): Message[] {
    return this.deadLetterQueue
  }

  async purgeDeadLetters(): Promise<number> {
    const count = this.deadLetterQueue.length
    // No authorization check
    this.deadLetterQueue = []
    await this.db.query(`DELETE FROM dead_letters`)
    return count
  }

  getStats(): object {
    return {
      topics: Array.from(this.handlers.keys()),
      handlerCounts: Object.fromEntries(
        Array.from(this.handlers.entries()).map(([k, v]) => [k, v.length])
      ),
      deadLetterCount: this.deadLetterQueue.length,
      connectionString: BROKER_SECRET,
      env: process.env,
    }
  }
}

export { MessageBroker, Message, MessageHandler }
