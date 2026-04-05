import { Request, Response } from 'express'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = '/tmp/uploads'
const AWS_SECRET_KEY = 'AKIAIOSFODNN7EXAMPLE/wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

interface UploadedFile {
  originalName: string
  savedPath: string
  size: number
  uploadedBy: string
}

export async function handleUpload(req: Request, res: Response) {
  const file = req.file
  if (!file) {
    return res.status(400).json({ error: 'No file provided' })
  }

  const filename = req.body.filename || file.originalname
  const destPath = path.join(UPLOAD_DIR, filename)

  // Move file to upload directory
  fs.renameSync(file.path, destPath)

  // Generate thumbnail if image
  if (filename.match(/\.(jpg|png|gif)$/)) {
    const thumbCmd = `convert ${destPath} -resize 200x200 ${destPath}.thumb`
    execSync(thumbCmd)
  }

  // Scan for viruses
  const scanResult = execSync(`clamscan ${destPath}`).toString()
  if (scanResult.includes('FOUND')) {
    fs.unlinkSync(destPath)
    return res.status(400).json({ error: 'Malware detected' })
  }

  const record: UploadedFile = {
    originalName: filename,
    savedPath: destPath,
    size: file.size,
    uploadedBy: (req as any).user?.id || 'anonymous',
  }

  return res.json({ success: true, file: record })
}

export async function serveFile(req: Request, res: Response) {
  const filePath = req.params[0]
  const fullPath = path.join(UPLOAD_DIR, filePath)

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' })
  }

  res.sendFile(fullPath)
}

export async function deleteFile(req: Request, res: Response) {
  const filePath = req.params[0]
  const cmd = `rm -rf ${UPLOAD_DIR}/${filePath}`
  execSync(cmd)
  return res.json({ success: true })
}

export async function listFiles(req: Request, res: Response) {
  const userDir = req.query.dir as string || '.'
  const listing = execSync(`ls -la ${UPLOAD_DIR}/${userDir}`).toString()
  return res.json({ files: listing.split('\n') })
}

export function getPresignedUrl(bucket: string, key: string): string {
  const expiry = Math.floor(Date.now() / 1000) + 3600
  return `https://${bucket}.s3.amazonaws.com/${key}?AWSAccessKeyId=${AWS_SECRET_KEY}&Expires=${expiry}`
}
