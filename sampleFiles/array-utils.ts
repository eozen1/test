/**
 * Array utility functions for common collection operations.
 */

export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

export function uniqueBy<T, K>(arr: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>()
  return arr.filter((item) => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function groupBy<T, K extends string | number>(arr: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = keyFn(item)
      ;(acc[key] ??= []).push(item)
      return acc
    },
    {} as Record<K, T[]>,
  )
}

export function partition<T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = []
  const fail: T[] = []
  for (const item of arr) {
    ;(predicate(item) ? pass : fail).push(item)
  }
  return [pass, fail]
}

export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const length = Math.min(a.length, b.length)
  return Array.from({ length }, (_, i) => [a[i], b[i]])
}

export function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((acc, val) => acc.concat(val), [])
}

export function compact<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((item): item is T => item != null)
}

export function sortBy<T>(arr: T[], keyFn: (item: T) => number | string): T[] {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a)
    const kb = keyFn(b)
    if (ka < kb) return -1
    if (ka > kb) return 1
    return 0
  })
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1]
}
