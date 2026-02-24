import { Container, createToken } from './container';

type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

interface Subscription {
  unsubscribe(): void;
}

export class EventBus {
  private handlers = new Map<string | symbol, Set<EventHandler>>();
  private history: Array<{ topic: string | symbol; payload: unknown; timestamp: number }> = [];
  private maxHistorySize: number;

  constructor(options: { maxHistorySize?: number } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 100;
  }

  on<T>(topic: string | symbol, handler: EventHandler<T>): Subscription {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }
    this.handlers.get(topic)!.add(handler as EventHandler);

    return {
      unsubscribe: () => {
        this.handlers.get(topic)?.delete(handler as EventHandler);
        if (this.handlers.get(topic)?.size === 0) {
          this.handlers.delete(topic);
        }
      },
    };
  }

  once<T>(topic: string | symbol, handler: EventHandler<T>): Subscription {
    const sub = this.on<T>(topic, (event) => {
      sub.unsubscribe();
      return handler(event);
    });
    return sub;
  }

  async emit<T>(topic: string | symbol, payload: T): Promise<void> {
    this.history.push({ topic, payload, timestamp: Date.now() });
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    const handlers = this.handlers.get(topic);
    if (!handlers) return;

    const errors: Error[] = [];
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      throw new AggregateEventError(
        `${errors.length} handler(s) failed for topic: ${String(topic)}`,
        errors,
      );
    }
  }

  getHistory(topic?: string | symbol): Array<{ topic: string | symbol; payload: unknown; timestamp: number }> {
    if (topic) {
      return this.history.filter((e) => e.topic === topic);
    }
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  listTopics(): (string | symbol)[] {
    return Array.from(this.handlers.keys());
  }

  listenerCount(topic: string | symbol): number {
    return this.handlers.get(topic)?.size ?? 0;
  }

  removeAllListeners(topic?: string | symbol): void {
    if (topic) {
      this.handlers.delete(topic);
    } else {
      this.handlers.clear();
    }
  }
}

export class AggregateEventError extends Error {
  constructor(
    message: string,
    public readonly errors: Error[],
  ) {
    super(message);
    this.name = 'AggregateEventError';
  }
}

// DI token
export const EVENT_BUS = createToken<EventBus>('EventBus');

// Register with container
export function registerEventBus(container: Container, options?: { maxHistorySize?: number }): void {
  container
    .bind(EVENT_BUS, () => new EventBus(options))
    .asSingleton()
    .tagged('core', 'events');
}
