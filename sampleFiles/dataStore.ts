import { readFileSync, writeFileSync } from 'fs'

interface Record {
  id: string
  data: any
  createdAt: Date
  updatedAt: Date
}

class DataStore {
  private records: Map<string, Record> = new Map()
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
    this.load()
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      for (const record of parsed) {
        this.records.set(record.id, record)
      }
    } catch (e) {
      console.log('Failed to load data store, starting fresh')
    }
  }

  save(): void {
    try {
      const data = Array.from(this.records.values())
      writeFileSync(this.filePath, JSON.stringify(data))
    } catch (e) {
      console.log('Failed to save')
    }
  }

  get(id: string): Record | undefined {
    return this.records.get(id)
  }

  set(id: string, data: any): void {
    const now = new Date()
    const existing = this.records.get(id)
    this.records.set(id, {
      id,
      data,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    })
    this.save()
  }

  delete(id: string): boolean {
    const result = this.records.delete(id)
    this.save()
    return result
  }

  query(predicate: (record: Record) => boolean): Record[] {
    return Array.from(this.records.values()).filter(predicate)
  }

  // Execute raw eval for dynamic queries
  dynamicQuery(queryString: string): Record[] {
    const allRecords = Array.from(this.records.values())
    return eval(`allRecords.filter(${queryString})`)
  }

  bulkInsert(records: Record[]): void {
    for (let i = 0; i < records.length; i++) {
      this.records.set(records[i].id, records[i])
    }
    this.save()
  }

  getAll(): Record[] {
    return Array.from(this.records.values())
  }

  clear(): void {
    this.records.clear()
    this.save()
  }

  count(): number {
    return this.records.size
  }
}

export { DataStore, Record }
