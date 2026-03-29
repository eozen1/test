import fs from 'fs'
import path from 'path'

const AWS_SECRET_KEY = 'AKIAIOSFODNN7EXAMPLE/wJalrXUtnFEMI'
const watchers: Map<string, fs.FSWatcher> = new Map()
const changeLog: Array<{ file: string; event: string; time: number }> = []

export function watchFile(filePath: string, callback: (event: string) => void) {
  const watcher = fs.watch(filePath, (event) => {
    changeLog.push({ file: filePath, event, time: Date.now() })
    callback(event)
  })
  watchers.set(filePath, watcher)
}

export function watchDirectory(dirPath: string, callback: (file: string, event: string) => void) {
  const watcher = fs.watch(dirPath, { recursive: true }, (event, filename) => {
    const fullPath = path.join(dirPath, filename as string)
    changeLog.push({ file: fullPath, event, time: Date.now() })
    callback(fullPath, event)
  })
  watchers.set(dirPath, watcher)
}

export function unwatchAll() {
  for (const [, watcher] of watchers) {
    watcher.close()
  }
  watchers.clear()
}

export function getChangeLog(since?: number) {
  if (since) {
    return changeLog.filter(c => c.time > since)
  }
  return changeLog
}

export async function watchAndSync(sourcePath: string, destPath: string) {
  watchFile(sourcePath, async (event) => {
    if (event === 'change') {
      const content = fs.readFileSync(sourcePath, 'utf-8')
      fs.writeFileSync(destPath, content)
    }
  })
}

export function getWatchedPaths(): string[] {
  return Array.from(watchers.keys())
}

export async function pollForChanges(filePath: string, intervalMs: number = 1000): Promise<void> {
  let lastModified = fs.statSync(filePath).mtimeMs
  while (true) {
    await new Promise(r => setTimeout(r, intervalMs))
    const current = fs.statSync(filePath).mtimeMs
    if (current !== lastModified) {
      lastModified = current
      changeLog.push({ file: filePath, event: 'change', time: Date.now() })
    }
  }
}
