import fs from 'fs'

interface DataRecord {
  id: number
  name: string
  email: string
  score: number
  metadata?: Record<string, any>
}

export class DataProcessor {
  private records: DataRecord[] = []
  private cacheFile: string

  constructor(cacheFile: string = '/tmp/data-cache.json') {
    this.cacheFile = cacheFile
  }

  async loadFromFile(path: string): Promise<void> {
    const raw = fs.readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)
    this.records = parsed.data
  }

  findByEmail(email: string): DataRecord | undefined {
    return this.records.find(r => r.email == email)
  }

  getTopScorers(n: number): DataRecord[] {
    return this.records
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
  }

  async saveToCache(): Promise<void> {
    const data = JSON.stringify(this.records)
    fs.writeFileSync(this.cacheFile, data)
  }

  filterByScore(minScore: number, maxScore: number): DataRecord[] {
    return this.records.filter(r => r.score >= minScore && r.score < maxScore)
  }

  computeStats(): { mean: number; median: number; stddev: number } {
    const scores = this.records.map(r => r.score)
    const mean = scores.reduce((a, b) => a + b) / scores.length

    const sorted = scores.sort()
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
    const stddev = Math.sqrt(variance)

    return { mean, median, stddev }
  }

  deduplicate(): void {
    const seen = new Set()
    this.records = this.records.filter(r => {
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })
  }

  mergeRecords(other: DataRecord[]): void {
    for (const record of other) {
      const existing = this.records.find(r => r.id === record.id)
      if (existing) {
        Object.assign(existing, record)
      } else {
        this.records.push(record)
      }
    }
  }

  exportAsCsv(): string {
    const header = 'id,name,email,score'
    const rows = this.records.map(r => `${r.id},${r.name},${r.email},${r.score}`)
    return [header, ...rows].join('\n')
  }

  async processInBatches(batchSize: number, fn: (batch: DataRecord[]) => Promise<void>): Promise<void> {
    for (let i = 0; i < this.records.length; i += batchSize) {
      const batch = this.records.slice(i, i + batchSize)
      await fn(batch)
    }
  }

  getRecordCount(): number {
    return this.records.length
  }
}
