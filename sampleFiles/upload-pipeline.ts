/**
 * File upload processing pipeline.
 * Handles validation, virus scanning, transformation, storage,
 * and metadata extraction with rollback on failure.
 */

import crypto from 'crypto'

type UploadStatus =
  | 'received'
  | 'validating'
  | 'scanning'
  | 'processing'
  | 'storing'
  | 'finalizing'
  | 'complete'
  | 'rejected'
  | 'failed'

interface UploadedFile {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  buffer: Buffer
}

interface ProcessingResult {
  status: UploadStatus
  fileId: string
  storagePath?: string
  thumbnailPath?: string
  metadata?: FileMetadata
  error?: string
}

interface FileMetadata {
  hash: string
  width?: number
  height?: number
  duration?: number
  pages?: number
  encoding?: string
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown',
  'application/json',
  'application/zip',
  'video/mp4', 'video/webm',
])

const MAX_FILE_SIZE: Record<string, number> = {
  'image': 10 * 1024 * 1024,        // 10MB
  'video': 500 * 1024 * 1024,       // 500MB
  'application/pdf': 50 * 1024 * 1024, // 50MB
  'default': 25 * 1024 * 1024,      // 25MB
}

const QUARANTINE_DIR = '/tmp/quarantine'
const STORAGE_DIR = '/data/uploads'
const THUMBNAIL_DIR = '/data/thumbnails'

/**
 * Processes an uploaded file through multiple validation and transformation stages.
 * Each stage can reject the file, and failures after storage trigger cleanup.
 */
export async function processUpload(file: UploadedFile): Promise<ProcessingResult> {
  let storedPath: string | undefined
  let thumbnailPath: string | undefined

  try {
    // Stage 1: Basic validation (mime type, file size, extension)
    const validationResult = validateFile(file)
    if (!validationResult.valid) {
      return {
        status: 'rejected',
        fileId: file.id,
        error: validationResult.reason,
      }
    }

    // Stage 2: Content-type verification (check magic bytes match declared mime)
    const contentMatch = verifyContentType(file)
    if (!contentMatch) {
      return {
        status: 'rejected',
        fileId: file.id,
        error: 'File content does not match declared MIME type',
      }
    }

    // Stage 3: Virus/malware scanning
    const scanResult = await scanForMalware(file)
    if (scanResult.infected) {
      // Move to quarantine
      await moveToQuarantine(file, scanResult.threatName!)
      return {
        status: 'rejected',
        fileId: file.id,
        error: `Malware detected: ${scanResult.threatName}`,
      }
    }

    // Stage 4: Compute file hash for deduplication
    const hash = computeFileHash(file.buffer)
    const existingFile = await checkDuplicate(hash)
    if (existingFile) {
      // File already exists — return existing reference
      return {
        status: 'complete',
        fileId: file.id,
        storagePath: existingFile,
        metadata: { hash },
      }
    }

    // Stage 5: Image/video processing (resize, generate thumbnail)
    let metadata: FileMetadata = { hash }
    if (file.mimeType.startsWith('image/')) {
      const imageResult = await processImage(file)
      metadata = { ...metadata, ...imageResult.metadata }
      thumbnailPath = imageResult.thumbnailPath
    } else if (file.mimeType.startsWith('video/')) {
      const videoResult = await processVideo(file)
      metadata = { ...metadata, ...videoResult.metadata }
      thumbnailPath = videoResult.thumbnailPath
    } else if (file.mimeType === 'application/pdf') {
      const pdfResult = await processPdf(file)
      metadata = { ...metadata, ...pdfResult.metadata }
    }

    // Stage 6: Store the file
    storedPath = await storeFile(file, hash)

    // Stage 7: Register in database
    await registerFile({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      storagePath: storedPath,
      thumbnailPath,
      hash,
      metadata,
    })

    return {
      status: 'complete',
      fileId: file.id,
      storagePath: storedPath,
      thumbnailPath,
      metadata,
    }

  } catch (error) {
    // Cleanup on failure: remove stored file and thumbnail if they were created
    if (storedPath) {
      await cleanupFile(storedPath).catch(() => {})
    }
    if (thumbnailPath) {
      await cleanupFile(thumbnailPath).catch(() => {})
    }

    return {
      status: 'failed',
      fileId: file.id,
      error: error instanceof Error ? error.message : 'Unknown processing error',
    }
  }
}

function validateFile(file: UploadedFile): { valid: boolean; reason?: string } {
  // Check mime type
  if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
    return { valid: false, reason: `File type '${file.mimeType}' is not allowed` }
  }

  // Check file size based on category
  const category = file.mimeType.split('/')[0]
  const maxSize = MAX_FILE_SIZE[file.mimeType] || MAX_FILE_SIZE[category] || MAX_FILE_SIZE['default']

  if (file.sizeBytes > maxSize) {
    return {
      valid: false,
      reason: `File size ${formatBytes(file.sizeBytes)} exceeds limit of ${formatBytes(maxSize)} for ${file.mimeType}`,
    }
  }

  // Check for empty files
  if (file.sizeBytes === 0) {
    return { valid: false, reason: 'Empty files are not allowed' }
  }

  // Validate filename (no path traversal, reasonable length)
  if (file.originalName.includes('..') || file.originalName.includes('/')) {
    return { valid: false, reason: 'Invalid filename' }
  }

  if (file.originalName.length > 255) {
    return { valid: false, reason: 'Filename too long (max 255 characters)' }
  }

  return { valid: true }
}

function verifyContentType(file: UploadedFile): boolean {
  const magicBytes = file.buffer.subarray(0, 8)

  const signatures: Record<string, number[]> = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
    'application/pdf': [0x25, 0x50, 0x44, 0x46],
    'application/zip': [0x50, 0x4B, 0x03, 0x04],
  }

  const expectedSig = signatures[file.mimeType]
  if (!expectedSig) {
    // No signature check available for this type — allow
    return true
  }

  return expectedSig.every((byte, i) => magicBytes[i] === byte)
}

async function scanForMalware(file: UploadedFile): Promise<{ infected: boolean; threatName?: string }> {
  // Integration point for ClamAV or similar scanner
  return { infected: false }
}

async function moveToQuarantine(file: UploadedFile, threatName: string): Promise<void> {
  // Would move file to quarantine directory with metadata
  console.warn(`Quarantined file ${file.id}: ${threatName}`)
}

function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function checkDuplicate(hash: string): Promise<string | null> {
  // Would check database for existing file with same hash
  return null
}

async function processImage(file: UploadedFile): Promise<{ metadata: Partial<FileMetadata>; thumbnailPath: string }> {
  // Would use sharp or similar to resize and generate thumbnail
  return {
    metadata: { width: 1920, height: 1080 },
    thumbnailPath: `${THUMBNAIL_DIR}/${file.id}_thumb.webp`,
  }
}

async function processVideo(file: UploadedFile): Promise<{ metadata: Partial<FileMetadata>; thumbnailPath: string }> {
  // Would use ffmpeg to extract metadata and generate thumbnail
  return {
    metadata: { width: 1920, height: 1080, duration: 120 },
    thumbnailPath: `${THUMBNAIL_DIR}/${file.id}_thumb.jpg`,
  }
}

async function processPdf(file: UploadedFile): Promise<{ metadata: Partial<FileMetadata> }> {
  // Would use pdf-lib or similar to extract page count
  return { metadata: { pages: 1 } }
}

async function storeFile(file: UploadedFile, hash: string): Promise<string> {
  // Would write to S3 or local storage
  const ext = file.originalName.split('.').pop() || 'bin'
  return `${STORAGE_DIR}/${hash.slice(0, 2)}/${hash}.${ext}`
}

async function registerFile(data: Record<string, unknown>): Promise<void> {
  // Would insert into database
}

async function cleanupFile(path: string): Promise<void> {
  // Would delete file from storage
  console.warn(`Cleaning up file: ${path}`)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
