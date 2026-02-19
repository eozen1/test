type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
}

interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: unknown,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
  }
}

class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private interceptors: Array<(options: RequestOptions) => RequestOptions> = [];

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
    };
  }

  addInterceptor(fn: (options: RequestOptions) => RequestOptions): void {
    this.interceptors.push(fn);
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    let resolvedOptions = { ...options };
    for (const interceptor of this.interceptors) {
      resolvedOptions = interceptor(resolvedOptions);
    }

    const headers = { ...this.defaultHeaders, ...resolvedOptions.headers };
    const retries = resolvedOptions.retries ?? 0;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = options.timeout
          ? setTimeout(() => controller.abort(), options.timeout)
          : null;

        const response = await fetch(url, {
          method,
          headers,
          body: resolvedOptions.body ? JSON.stringify(resolvedOptions.body) : undefined,
          signal: controller.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!response.ok) {
          throw new HttpError(response.status, response.statusText, await response.text());
        }

        const data = await response.json() as T;
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return { status: response.status, data, headers: responseHeaders };
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  async get<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, body: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async put<T>(path: string, body: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }
}

export { HttpClient, HttpError, HttpMethod, RequestOptions, HttpResponse };
