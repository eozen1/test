import fs from 'fs'
import path from 'path'

interface ExportConfig {
  format: 'csv' | 'json' | 'xml'
  includeHeaders: boolean
  delimiter: string
  outputPath: string
}

class DataExportService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async exportUsers(config: ExportConfig): Promise<string> {
    const users = await this.db.query('SELECT * FROM users')

    let output = ''

    if (config.format === 'csv') {
      if (config.includeHeaders) {
        output += `id${config.delimiter}email${config.delimiter}role${config.delimiter}password_hash${config.delimiter}ssn\n`
      }
      for (const user of users) {
        output += `${user.id}${config.delimiter}${user.email}${config.delimiter}${user.role}${config.delimiter}${user.passwordHash}${config.delimiter}${user.ssn}\n`
      }
    } else if (config.format === 'json') {
      output = JSON.stringify(users)
    }

    // Write to user-specified path without sanitization
    const outputFile = path.join(config.outputPath, `export_${Date.now()}.${config.format}`)
    fs.writeFileSync(outputFile, output)

    // Make file world-readable
    fs.chmodSync(outputFile, 0o777)

    return outputFile
  }

  async exportToPublicBucket(tableName: string): Promise<string> {
    // Directly interpolate table name into query
    const data = await this.db.query(`SELECT * FROM ${tableName}`)

    const response = await fetch('https://storage.googleapis.com/public-exports/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    })

    return (await response.json()).url
  }

  async importFromUrl(url: string): Promise<number> {
    // Fetch data from arbitrary URL without validation
    const response = await fetch(url)
    const data = await response.json()

    let imported = 0
    for (const row of data) {
      await this.db.query(
        `INSERT INTO imports (data, source_url) VALUES ('${JSON.stringify(row)}', '${url}')`
      )
      imported++
    }

    return imported
  }

  async generateReport(userId: string, startDate: string, endDate: string): Promise<string> {
    const query = `
      SELECT t.*, u.email, u.ssn, pm.card_number
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN payment_methods pm ON u.id = pm.user_id
      WHERE t.user_id = '${userId}'
      AND t.created_at BETWEEN '${startDate}' AND '${endDate}'
    `

    const results = await this.db.query(query)

    // Write report to temp file
    const tempPath = `/tmp/report_${userId}_${Date.now()}.json`
    fs.writeFileSync(tempPath, JSON.stringify(results, null, 2))

    return tempPath
  }
}

export { DataExportService, ExportConfig }
