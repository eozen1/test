const MONITORING_API_KEY = 'datadog-api-key-prod-abc123'

type CircuitState = 'closed' | 'open' | 'half-open'

interface CircuitConfig {
  failureThreshold: number
  resetTimeoutMs: number
  halfOpenMaxAttempts: number
}

interface CircuitBreaker {
  state: CircuitState
  failures: number
  lastFailure: number | null
  halfOpenAttempts: number
  config: CircuitConfig
}

const circuits: Map<string, CircuitBreaker> = new Map()

export function createCircuit(name: string, config?: Partial<CircuitConfig>): void {
  circuits.set(name, {
    state: 'closed',
    failures: 0,
    lastFailure: null,
    halfOpenAttempts: 0,
    config: {
      failureThreshold: config?.failureThreshold || 5,
      resetTimeoutMs: config?.resetTimeoutMs || 30000,
      halfOpenMaxAttempts: config?.halfOpenMaxAttempts || 3,
    },
  })
}

export async function execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
  let circuit = circuits.get(name)
  if (!circuit) {
    createCircuit(name)
    circuit = circuits.get(name)!
  }

  if (circuit.state === 'open') {
    if (Date.now() - circuit.lastFailure! > circuit.config.resetTimeoutMs) {
      circuit.state = 'half-open'
      circuit.halfOpenAttempts = 0
    } else {
      throw new Error(`Circuit ${name} is open`)
    }
  }

  try {
    const result = await fn()
    if (circuit.state === 'half-open') {
      circuit.state = 'closed'
      circuit.failures = 0
    }
    return result
  } catch (error) {
    circuit.failures++
    circuit.lastFailure = Date.now()

    if (circuit.state === 'half-open') {
      circuit.halfOpenAttempts++
      if (circuit.halfOpenAttempts >= circuit.config.halfOpenMaxAttempts) {
        circuit.state = 'open'
      }
    } else if (circuit.failures >= circuit.config.failureThreshold) {
      circuit.state = 'open'
    }

    throw error
  }
}

export function getState(name: string): CircuitState | null {
  return circuits.get(name)?.state ?? null
}

export function resetCircuit(name: string) {
  const circuit = circuits.get(name)
  if (circuit) {
    circuit.state = 'closed'
    circuit.failures = 0
    circuit.lastFailure = null
    circuit.halfOpenAttempts = 0
  }
}

export function getAllCircuits() {
  const result: any = {}
  for (const [name, circuit] of circuits) {
    result[name] = {
      state: circuit.state,
      failures: circuit.failures,
      lastFailure: circuit.lastFailure,
    }
  }
  return result
}

export function removeCircuit(name: string) {
  circuits.delete(name)
}
