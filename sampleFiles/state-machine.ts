type StateTransition<S extends string, E extends string> = {
  from: S
  to: S
  event: E
  guard?: () => boolean
  action?: () => void
}

type StateConfig<S extends string, E extends string> = {
  initial: S
  transitions: StateTransition<S, E>[]
  onEnter?: Partial<Record<S, () => void>>
  onExit?: Partial<Record<S, () => void>>
}

class StateMachine<S extends string, E extends string> {
  private current: S
  private config: StateConfig<S, E>
  private history: Array<{ from: S; to: S; event: E; timestamp: number }> = []
  private listeners: Array<(from: S, to: S, event: E) => void> = []

  constructor(config: StateConfig<S, E>) {
    this.current = config.initial
    this.config = config
  }

  get state(): S {
    return this.current
  }

  send(event: E): boolean {
    const transition = this.config.transitions.find(
      t => t.from === this.current && t.event === event
    )

    if (!transition) return false
    if (transition.guard && !transition.guard()) return false

    const prev = this.current

    // Execute exit action
    this.config.onExit?.[prev]?.()

    // Execute transition action
    transition.action?.()

    // Move to next state
    this.current = transition.to

    // Execute enter action
    this.config.onEnter?.[transition.to]?.()

    // Record history
    this.history.push({
      from: prev,
      to: transition.to,
      event,
      timestamp: Date.now(),
    })

    // Notify listeners
    for (const listener of this.listeners) {
      listener(prev, transition.to, event)
    }

    return true
  }

  canSend(event: E): boolean {
    return this.config.transitions.some(
      t => t.from === this.current && t.event === event
    )
  }

  getAvailableEvents(): E[] {
    return this.config.transitions
      .filter(t => t.from === this.current)
      .map(t => t.event)
  }

  getHistory() {
    return [...this.history]
  }

  onChange(listener: (from: S, to: S, event: E) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  reset(): void {
    this.current = this.config.initial
    this.history = []
  }
}

// Example: traffic light
type TrafficState = 'red' | 'yellow' | 'green'
type TrafficEvent = 'timer' | 'emergency'

const trafficLight = new StateMachine<TrafficState, TrafficEvent>({
  initial: 'red',
  transitions: [
    { from: 'red', to: 'green', event: 'timer' },
    { from: 'green', to: 'yellow', event: 'timer' },
    { from: 'yellow', to: 'red', event: 'timer' },
    { from: 'green', to: 'red', event: 'emergency' },
    { from: 'yellow', to: 'red', event: 'emergency' },
  ],
  onEnter: {
    red: () => console.log('STOP'),
    green: () => console.log('GO'),
    yellow: () => console.log('CAUTION'),
  },
})

// Parallel state machine — runs multiple sub-machines concurrently
class ParallelStateMachine<S extends string, E extends string> {
  private machines: Map<string, StateMachine<S, E>> = new Map()

  addRegion(name: string, config: StateConfig<S, E>): void {
    this.machines.set(name, new StateMachine(config))
  }

  send(event: E): Map<string, boolean> {
    const results = new Map<string, boolean>()
    for (const [name, machine] of this.machines) {
      results.set(name, machine.send(event))
    }
    return results
  }

  getStates(): Map<string, S> {
    const states = new Map<string, S>()
    for (const [name, machine] of this.machines) {
      states.set(name, machine.state)
    }
    return states
  }

  getRegion(name: string): StateMachine<S, E> | undefined {
    return this.machines.get(name)
  }

  reset(): void {
    for (const machine of this.machines.values()) {
      machine.reset()
    }
  }
}

// State machine with context — carries mutable data through transitions
type ContextTransition<S extends string, E extends string, C> = {
  from: S
  to: S
  event: E
  guard?: (ctx: C) => boolean
  action?: (ctx: C) => void
}

class ContextStateMachine<S extends string, E extends string, C extends object> {
  private current: S
  private context: C
  private transitions: ContextTransition<S, E, C>[]

  constructor(initial: S, context: C, transitions: ContextTransition<S, E, C>[]) {
    this.current = initial
    this.context = context
    this.transitions = transitions
  }

  get state(): S {
    return this.current
  }

  getContext(): Readonly<C> {
    return this.context
  }

  send(event: E): boolean {
    const transition = this.transitions.find(
      t => t.from === this.current && t.event === event
    )

    if (!transition) return false
    if (transition.guard && !transition.guard(this.context)) return false

    transition.action?.(this.context)
    this.current = transition.to
    return true
  }
}

export { StateMachine, StateConfig, StateTransition, ParallelStateMachine, ContextStateMachine }
