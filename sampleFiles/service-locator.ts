import { Container, createToken } from './container';

// Service interfaces
interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

interface HttpClient {
  get<T>(url: string, headers?: Record<string, string>): Promise<T>;
  post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  put<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  delete(url: string, headers?: Record<string, string>): Promise<void>;
}

interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

// Tokens
export const LOGGER = createToken<Logger>('Logger');
export const HTTP_CLIENT = createToken<HttpClient>('HttpClient');
export const CACHE = createToken<Cache>('Cache');

// Default implementations
class ConsoleLogger implements Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix ? `[${prefix}] ` : '';
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.log(`${this.prefix}INFO: ${message}`, meta || '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`${this.prefix}WARN: ${message}`, meta || '');
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    console.error(`${this.prefix}ERROR: ${message}`, error, meta || '');
  }
}

class InMemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

class FetchHttpClient implements HttpClient {
  constructor(
    private baseUrl: string,
    private defaultHeaders: Record<string, string> = {},
  ) {}

  async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'GET',
      headers: { ...this.defaultHeaders, ...headers },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  async post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.defaultHeaders, ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  async put<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.defaultHeaders, ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  async delete(url: string, headers?: Record<string, string>): Promise<void> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'DELETE',
      headers: { ...this.defaultHeaders, ...headers },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

// Bootstrap
export function createDefaultContainer(config: {
  logPrefix?: string;
  apiBaseUrl?: string;
  apiHeaders?: Record<string, string>;
}): Container {
  const container = new Container();

  container
    .bind(LOGGER, () => new ConsoleLogger(config.logPrefix))
    .asSingleton()
    .tagged('core', 'logging');

  container
    .bind(CACHE, () => new InMemoryCache())
    .asSingleton()
    .tagged('core', 'storage');

  container
    .bind(HTTP_CLIENT, () => new FetchHttpClient(
      config.apiBaseUrl || 'http://localhost:3000',
      config.apiHeaders || {},
    ))
    .asSingleton()
    .tagged('core', 'network');

  return container;
}
