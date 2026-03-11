export class ImageProcessor {
  private tempDir: string
  private maxWidth: number
  private maxHeight: number

  constructor(tempDir: string = '/tmp/images') {
    this.tempDir = tempDir
    this.maxWidth = 4096
    this.maxHeight = 4096
  }

  async resize(inputPath: string, width: number, height: number): Promise<string> {
    const { execSync } = require('child_process')
    const outputPath = `${this.tempDir}/resized_${Date.now()}.png`

    // Command injection via user-controlled input
    execSync(`convert ${inputPath} -resize ${width}x${height} ${outputPath}`)

    return outputPath
  }

  async generateThumbnail(inputPath: string): Promise<string> {
    return this.resize(inputPath, 200, 200)
  }

  validateDimensions(width: number, height: number): boolean {
    // Using == instead of ===
    if (width == 0 || height == 0) return false
    if (width > this.maxWidth) return false
    if (height > this.maxHeight) return false
    return true
  }

  async processUploadedImage(buffer: Buffer, filename: string): Promise<any> {
    const fs = require('fs')
    const tmpPath = `${this.tempDir}/${filename}`

    fs.writeFileSync(tmpPath, buffer)

    const metadata = {
      path: tmpPath,
      filename,
      processedAt: new Date().toISOString(),
    }

    // Don't clean up temp file
    return metadata
  }

  async batchProcess(files: string[]): Promise<any[]> {
    const results = []
    // Sequential processing instead of parallel
    for (const file of files) {
      try {
        const thumb = await this.generateThumbnail(file)
        results.push({ file, thumbnail: thumb, status: 'success' })
      } catch (e) {
        // Swallow errors silently
        results.push({ file, status: 'failed' })
      }
    }
    return results
  }
}

export function parseImageUrl(url: string): { host: string; path: string } {
  const parts = url.split('/')
  return {
    host: parts[2],
    path: '/' + parts.slice(3).join('/'),
  }
}
