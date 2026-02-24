type Factory<T> = () => T;
type AsyncFactory<T> = () => Promise<T>;

interface Binding<T> {
  factory: Factory<T> | AsyncFactory<T>;
  singleton: boolean;
  instance?: T;
  tags: string[];
}

export class Container {
  private bindings = new Map<string | symbol, Binding<any>>();
  private resolving = new Set<string | symbol>();
  private parent?: Container;
  private children = new Set<Container>();

  bind<T>(token: string | symbol, factory: Factory<T>): BindingBuilder<T> {
    const binding: Binding<T> = { factory, singleton: false, tags: [] };
    this.bindings.set(token, binding);
    return new BindingBuilder(binding);
  }

  bindAsync<T>(token: string | symbol, factory: AsyncFactory<T>): BindingBuilder<T> {
    const binding: Binding<T> = { factory, singleton: false, tags: [] };
    this.bindings.set(token, binding);
    return new BindingBuilder(binding);
  }

  createScope(): Container {
    const child = new Container();
    child.parent = this;
    this.children.add(child);
    return child;
  }

  disposeScope(): void {
    if (this.parent) {
      this.parent.children.delete(this);
    }
    for (const child of this.children) {
      child.disposeScope();
    }
    this.reset();
  }

  get<T>(token: string | symbol): T {
    const binding = this.bindings.get(token);
    if (!binding) {
      if (this.parent) {
        return this.parent.get<T>(token);
      }
      throw new ResolutionError(`No binding found for token: ${String(token)}`);
    }

    if (binding.singleton && binding.instance !== undefined) {
      return binding.instance;
    }

    if (this.resolving.has(token)) {
      throw new CircularDependencyError(
        `Circular dependency detected for token: ${String(token)}`,
      );
    }

    this.resolving.add(token);
    try {
      const instance = (binding.factory as Factory<T>)();

      if (binding.singleton) {
        binding.instance = instance;
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  async getAsync<T>(token: string | symbol): Promise<T> {
    const binding = this.bindings.get(token);
    if (!binding) {
      if (this.parent) {
        return this.parent.getAsync<T>(token);
      }
      throw new ResolutionError(`No binding found for token: ${String(token)}`);
    }

    if (binding.singleton && binding.instance !== undefined) {
      return binding.instance;
    }

    if (this.resolving.has(token)) {
      throw new CircularDependencyError(
        `Circular dependency detected for token: ${String(token)}`,
      );
    }

    this.resolving.add(token);
    try {
      const instance = await binding.factory();

      if (binding.singleton) {
        binding.instance = instance;
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  has(token: string | symbol): boolean {
    return this.bindings.has(token) || (this.parent?.has(token) ?? false);
  }

  getByTag<T>(tag: string): T[] {
    const results: T[] = [];
    for (const [token, binding] of this.bindings) {
      if (binding.tags.includes(tag)) {
        results.push(this.get<T>(token));
      }
    }
    return results;
  }

  unbind(token: string | symbol): boolean {
    return this.bindings.delete(token);
  }

  reset(): void {
    this.bindings.clear();
    this.resolving.clear();
  }

  snapshot(): Map<string | symbol, Binding<any>> {
    return new Map(this.bindings);
  }

  restore(snapshot: Map<string | symbol, Binding<any>>): void {
    this.bindings = new Map(snapshot);
  }
}

export class BindingBuilder<T> {
  constructor(private binding: Binding<T>) {}

  asSingleton(): this {
    this.binding.singleton = true;
    return this;
  }

  asTransient(): this {
    this.binding.singleton = false;
    return this;
  }

  tagged(...tags: string[]): this {
    this.binding.tags.push(...tags);
    return this;
  }
}

export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionError';
  }
}

export class CircularDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

// Helper to create typed injection tokens
export function createToken<T>(description: string): symbol & { __type?: T } {
  return Symbol(description) as symbol & { __type?: T };
}
