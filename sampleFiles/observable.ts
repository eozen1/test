type Listener<T> = (data: T) => void;

export class Observable<T> {
  private listeners: Map<string, Listener<T>[]> = new Map();
  private onceListeners: Map<string, Listener<T>[]> = new Map();

  on(event: string, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      }
    };
  }

  once(event: string, listener: Listener<T>): void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, []);
    }
    this.onceListeners.get(event)!.push(listener);
  }

  emit(event: string, data: T): void {
    const listeners = this.listeners.get(event) || [];
    for (const listener of listeners) {
      listener(data);
    }

    const onceListeners = this.onceListeners.get(event) || [];
    for (const listener of onceListeners) {
      listener(data);
    }
    this.onceListeners.delete(event);
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  listenerCount(event: string): number {
    return (this.listeners.get(event)?.length || 0) + (this.onceListeners.get(event)?.length || 0);
  }
}

export class TypedObservable<Events extends Record<string, any>> {
  private emitters: Map<string, Observable<any>> = new Map();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const key = event as string;
    if (!this.emitters.has(key)) {
      this.emitters.set(key, new Observable());
    }
    return this.emitters.get(key)!.on('default', listener);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.emitters.get(event as string)?.emit('default', data);
  }

  dispose(): void {
    for (const emitter of this.emitters.values()) {
      emitter.removeAllListeners();
    }
    this.emitters.clear();
  }
}
