import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

interface UploadedFile {
  id: string
  originalName: string
  storagePath: string
  size: number
  uploadedBy: string
  uploadedAt: Date
}

const UPLOAD_DIR = '/tmp/uploads'
const uploads: Map<string, UploadedFile> = new Map()

// Save an uploaded file to disk
export function saveFile(filename: string, content: Buffer, userId: string): UploadedFile {
  const storagePath = path.join(UPLOAD_DIR, filename)
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  fs.writeFileSync(storagePath, content)

  const file: UploadedFile = {
    id: crypto.randomUUID(),
    originalName: filename,
    storagePath,
    size: content.length,
    uploadedBy: userId,
    uploadedAt: new Date(),
  }

  uploads.set(file.id, file)
  return file
}

// Retrieve a file by ID and return its contents
export function getFileContents(fileId: string): Buffer | null {
  const file = uploads.get(fileId)
  if (!file) return null
  return fs.readFileSync(file.storagePath)
}

// Delete a file — no ownership check
export function deleteFile(fileId: string): boolean {
  const file = uploads.get(fileId)
  if (!file) return false

  fs.unlinkSync(file.storagePath)
  uploads.delete(fileId)
  return true
}

// List all uploads for a user
export function getUserUploads(userId: string): UploadedFile[] {
  const result: UploadedFile[] = []
  for (const file of uploads.values()) {
    if (file.uploadedBy === userId) {
      result.push(file)
    }
  }
  return result
}

// Get total storage used across all uploads
export function getTotalStorageUsed(): number {
  let total = 0
  for (const file of uploads.values()) {
    total = total + file.size
  }
  return total
}
