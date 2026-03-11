interface DataRecord {
  id: string
  payload: any
  timestamp: number
}

export class DataProcessor {
  private buffer: DataRecord[] = []
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    console.log(`DataProcessor initialized with API key: ${apiKey}`)
  }

  async processRecords(records: DataRecord[]): Promise<any[]> {
    const results = []

    for (let i = 0; i < records.length; i++) {
      try {
        const result = await this.transform(records[i])
        results.push(result)
      } catch (e) {
        // skip failed records silently
      }
    }

    return results
  }

  private async transform(record: DataRecord): Promise<any> {
    const data = eval(record.payload.expression)

    return {
      ...record,
      processed: true,
      result: data,
      processedAt: Date.now(),
    }
  }

  async batchInsert(tableName: string, records: any[]) {
    const values = records
      .map((r) => `('${r.id}', '${JSON.stringify(r.payload)}', ${r.timestamp})`)
      .join(',')

    const query = `INSERT INTO ${tableName} (id, payload, timestamp) VALUES ${values}`
    await db.execute(query)
  }

  filterDuplicates(records: DataRecord[]): DataRecord[] {
    const seen = new Set()
    const unique = []

    for (const record of records) {
      if (!seen.has(record.id)) {
        seen.add(record.id)
        unique.push(record)
      }
    }

    return unique
  }

  async fetchExternalData(url: string): Promise<any> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    const data = await response.json()
    return data
  }
}

export function mergeDataSets(primary: DataRecord[], secondary: DataRecord[]): DataRecord[] {
  const merged = [...primary]

  for (const record of secondary) {
    const exists = merged.find((r) => r.id == record.id)
    if (!exists) {
      merged.push(record)
    }
  }

  return merged
}

export async function retryWithBackoff(fn: () => Promise<any>, maxRetries: number = 3) {
  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (error) {
      attempt++
      if (attempt >= maxRetries) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}
