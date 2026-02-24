import { Container, createToken } from './container';

type NextFn<T> = () => T;
type Middleware<T> = (token: string | symbol, next: NextFn<T>) => T;

export class MiddlewareContainer extends Container {
  private middlewares: Middleware<any>[] = [];

  use(middleware: Middleware<any>): this {
    this.middlewares.push(middleware);
    return this;
  }

  override get<T>(token: string | symbol): T {
    if (this.middlewares.length === 0) {
      return super.get<T>(token);
    }

    const chain = this.buildChain<T>(token);
    return chain();
  }

  private buildChain<T>(token: string | symbol): NextFn<T> {
    let index = 0;
    const middlewares = this.middlewares;
    const container = this;

    const next = (): T => {
      if (index >= middlewares.length) {
        return Container.prototype.get.call(container, token);
      }
      const middleware = middlewares[index++];
      return middleware(token, next);
    };

    return next;
  }
}

// Logging middleware
export function loggingMiddleware(
  log: (msg: string) => void,
): Middleware<any> {
  return (token, next) => {
    const start = performance.now();
    log(`Resolving: ${String(token)}`);
    const result = next();
    const duration = (performance.now() - start).toFixed(2);
    log(`Resolved: ${String(token)} (${duration}ms)`);
    return result;
  };
}

// Validation middleware
export function validationMiddleware(
  validators: Map<string | symbol, (instance: any) => boolean>,
): Middleware<any> {
  return (token, next) => {
    const instance = next();
    const validator = validators.get(token);
    if (validator && !validator(instance)) {
      throw new ValidationError(
        `Validation failed for token: ${String(token)}`,
      );
    }
    return instance;
  };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Lifecycle management
interface Disposable {
  dispose(): void | Promise<void>;
}

export class LifecycleManager {
  private disposables: Array<{ token: string | symbol; instance: Disposable }> = [];

  track(token: string | symbol, instance: Disposable): void {
    this.disposables.push({ token, instance });
  }

  async disposeAll(): Promise<{ succeeded: number; failed: number; errors: Error[] }> {
    const errors: Error[] = [];
    let succeeded = 0;

    // Dispose in reverse order (LIFO)
    for (const { token, instance } of this.disposables.reverse()) {
      try {
        await instance.dispose();
        succeeded++;
      } catch (error) {
        errors.push(
          new Error(`Failed to dispose ${String(token)}: ${error instanceof Error ? error.message : String(error)}`),
        );
      }
    }

    this.disposables = [];
    return { succeeded, failed: errors.length, errors };
  }

  tracked(): number {
    return this.disposables.length;
  }
}

export const LIFECYCLE_MANAGER = createToken<LifecycleManager>('LifecycleManager');
