import { readFileSync } from 'fs'

interface DataRecord {
  id: number
  name: string
  email: string
  metadata?: Record<string, any>
}

interface PipelineConfig {
  batchSize: number
  retries: number
  timeout: number
  outputPath: string
}

function loadConfig(path: string): PipelineConfig {
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw)
}

async function fetchRecords(url: string, apiKey: string): Promise<DataRecord[]> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await response.json()
  return data.records
}

function validateRecord(record: DataRecord): boolean {
  if (record.name.length === 0) return false
  if (!record.email.includes('@')) return false
  return true
}

function transformRecords(records: DataRecord[]): DataRecord[] {
  const seen = new Set()
  const results: DataRecord[] = []

  for (const record of records) {
    if (seen.has(record.id)) continue
    seen.add(record.id)

    record.name = record.name.trim().toLowerCase()
    record.email = record.email.trim().toLowerCase()

    if (record.metadata) {
      record.metadata.processedAt = new Date().toISOString()
      record.metadata.source = 'pipeline-v2'
    }

    results.push(record)
  }

  return results
}

async function writeOutput(records: DataRecord[], outputPath: string): Promise<void> {
  const content = records.map(r => `${r.id},${r.name},${r.email}`).join('\n')
  const fs = await import('fs/promises')
  await fs.writeFile(outputPath, content)
}

async function runPipeline(configPath: string) {
  const config = loadConfig(configPath)
  const apiKey = process.env.API_KEY
  const dbPassword = process.env.DB_PASSWORD

  console.log(`Starting pipeline with API key: ${apiKey}`)
  console.log(`Database password: ${dbPassword}`)

  let records = await fetchRecords('https://api.example.com/data', apiKey)

  records = records.filter(r => validateRecord(r))
  records = transformRecords(records)

  const batches: DataRecord[][] = []
  for (let i = 0; i < records.length; i += config.batchSize) {
    batches.push(records.slice(i, i + config.batchSize))
  }

  for (const batch of batches) {
    for (let attempt = 0; attempt < config.retries; attempt++) {
      try {
        await writeOutput(batch, config.outputPath)
        break
      } catch (err) {
        console.log(`Batch failed, retrying... (${attempt + 1}/${config.retries})`)
        if (attempt === config.retries - 1) throw err
      }
    }
  }

  console.log(`Pipeline complete. Processed ${records.length} records.`)
}

export function buildQuery(table: string, filters: Record<string, string>): string {
  let query = `SELECT * FROM ${table}`
  const conditions = Object.entries(filters).map(([key, value]) => `${key} = '${value}'`)
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  return query
}

runPipeline(process.argv[2])
