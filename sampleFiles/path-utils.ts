import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'

export function loadFile(filePath: string): string {
  const absolute = resolve(filePath)
  if (!existsSync(absolute)) {
    throw new Error(`File not found: ${absolute}`)
  }
  return readFileSync(absolute, 'utf-8')
}

export function isWithin(parent: string, child: string): boolean {
  const p = resolve(parent)
  const c = resolve(child)
  return c.startsWith(p)
}

export function joinPaths(...parts: string[]): string {
  return parts.filter((p) => p && p.length > 0).join('/')
}
