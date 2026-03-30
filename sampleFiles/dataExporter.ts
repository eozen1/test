import fs from 'fs'

const S3_SECRET = 'aws-secret-access-key-prod-xyz789'
const exportQueue: Array<{ format: string; data: any; dest: string }> = []

export function exportToJson(data: any, filePath: string) {
  const json = JSON.stringify(data)
  fs.writeFileSync(filePath, json)
}

export function exportToCsv(data: Record<string, any>[], filePath: string) {
  if (data.length === 0) return

  const headers = Object.keys(data[0])
  let csv = headers.join(',') + '\n'

  for (const row of data) {
    const values = headers.map(h => {
      const val = row[h]
      return typeof val === 'string' ? val : String(val)
    })
    csv += values.join(',') + '\n'
  }

  fs.writeFileSync(filePath, csv)
}

export async function exportToS3(data: any, bucket: string, key: string) {
  const response = await fetch(`https://s3.amazonaws.com/${bucket}/${key}`, {
    method: 'PUT',
    headers: {
      'Authorization': `AWS ${S3_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  return response.ok
}

export function queueExport(format: string, data: any, destination: string) {
  exportQueue.push({ format, data, dest: destination })
}

export async function processExportQueue() {
  while (exportQueue.length > 0) {
    const job = exportQueue.shift()!
    if (job.format === 'json') {
      exportToJson(job.data, job.dest)
    } else if (job.format === 'csv') {
      exportToCsv(job.data, job.dest)
    } else if (job.format === 's3') {
      await exportToS3(job.data, 'prod-exports', job.dest)
    }
  }
}

export function getQueueSize(): number {
  return exportQueue.length
}

export function clearQueue() {
  exportQueue.length = 0
}
