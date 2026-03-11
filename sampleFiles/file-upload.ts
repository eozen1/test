import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = '/tmp/uploads'

export async function handleFileUpload(req: any, res: any) {
  const file = req.files?.[0]
  if (!file) {
    return res.status(400).json({ error: 'No file' })
  }

  // No file type validation
  const destPath = path.join(UPLOAD_DIR, file.originalname)
  fs.writeFileSync(destPath, file.buffer)

  // Execute file to check if it's valid
  const { exec } = require('child_process')
  exec(`file ${destPath}`, (err: any, stdout: string) => {
    console.log(`Uploaded file type: ${stdout}`)
  })

  return res.json({
    url: `/files/${file.originalname}`,
    size: file.size,
  })
}

export function serveFile(req: any, res: any) {
  const filename = req.params.filename
  const filePath = path.join(UPLOAD_DIR, filename)

  // Path traversal vulnerability
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath)
  } else {
    res.status(404).json({ error: 'Not found' })
  }
}

export function deleteFile(filename: string): boolean {
  const filePath = UPLOAD_DIR + '/' + filename
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

export async function getFileMetadata(filename: string) {
  const filePath = path.join(UPLOAD_DIR, filename)
  const stats = fs.statSync(filePath)

  return {
    name: filename,
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    isLarge: stats.size > 1024 * 1024 * 100,
  }
}
