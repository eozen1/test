type NextFunction = () => Promise<void> | void;
type MiddlewareFunction<T> = (context: T, next: NextFunction) => Promise<void> | void;

export class MiddlewarePipeline<T> {
  private middlewares: MiddlewareFunction<T>[] = [];

  use(middleware: MiddlewareFunction<T>): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(context: T): Promise<void> {
    let index = 0;

    const next: NextFunction = async () => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware(context, next);
      }
    };

    await next();
  }

  remove(middleware: MiddlewareFunction<T>): boolean {
    const idx = this.middlewares.indexOf(middleware);
    if (idx === -1) return false;
    this.middlewares.splice(idx, 1);
    return true;
  }

  clear(): void {
    this.middlewares = [];
  }

  get length(): number {
    return this.middlewares.length;
  }
}

// Common middleware helpers
export function compose<T>(...middlewares: MiddlewareFunction<T>[]): MiddlewareFunction<T> {
  return async (context: T, next: NextFunction) => {
    let idx = 0;
    const run = async (): Promise<void> => {
      if (idx < middlewares.length) {
        await middlewares[idx++](context, run);
      } else {
        await next();
      }
    };
    await run();
  };
}

export function withTimeout<T>(ms: number, middleware: MiddlewareFunction<T>): MiddlewareFunction<T> {
  return async (context: T, next: NextFunction) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Middleware timed out after ${ms}ms`)), ms);
    });

    await Promise.race([
      middleware(context, next),
      timeoutPromise,
    ]);
  };
}

export function withRetry<T>(
  retries: number,
  middleware: MiddlewareFunction<T>,
): MiddlewareFunction<T> {
  return async (context: T, next: NextFunction) => {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await middleware(context, next);
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }
    throw lastError;
  };
}
