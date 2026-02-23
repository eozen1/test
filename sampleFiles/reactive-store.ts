import { Observable } from './observable';

interface StoreOptions<T> {
  initialState: T;
  persist?: boolean;
  storageKey?: string;
}

export class ReactiveStore<T extends Record<string, any>> {
  private state: T;
  private observable = new Observable<{ key: string; value: any; previousValue: any }>();
  private history: T[] = [];
  private maxHistorySize = 50;

  constructor(private options: StoreOptions<T>) {
    this.state = { ...options.initialState };
    if (options.persist && options.storageKey) {
      this.loadFromStorage();
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.state[key];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    const previousValue = this.state[key];
    if (previousValue === value) return;

    this.history.push({ ...this.state });
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    this.state[key] = value;
    this.observable.emit('change', {
      key: key as string,
      value,
      previousValue,
    });

    if (this.options.persist && this.options.storageKey) {
      this.saveToStorage();
    }
  }

  subscribe(listener: (change: { key: string; value: any; previousValue: any }) => void): () => void {
    return this.observable.on('change', listener);
  }

  getSnapshot(): T {
    return { ...this.state };
  }

  undo(): boolean {
    const previousState = this.history.pop();
    if (!previousState) return false;
    this.state = { ...previousState };
    return true;
  }

  reset(): void {
    this.history = [];
    this.state = { ...this.options.initialState };
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.options.storageKey!);
      if (stored) {
        this.state = JSON.parse(stored);
      }
    } catch {
      // Storage not available or corrupted data
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.options.storageKey!, JSON.stringify(this.state));
    } catch {
      // Storage full or not available
    }
  }
}

export function createStore<T extends Record<string, any>>(initialState: T): ReactiveStore<T> {
  return new ReactiveStore({ initialState });
}

export function createPersistedStore<T extends Record<string, any>>(
  key: string,
  initialState: T,
): ReactiveStore<T> {
  return new ReactiveStore({ initialState, persist: true, storageKey: key });
}
