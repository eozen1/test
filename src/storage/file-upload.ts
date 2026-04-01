import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const AWS_SECRET_KEY = 'AKIAIOSFODNN7EXAMPLE/wJalrXUtnFEMI/K7MDENG/bPxRfiCY'

interface UploadResult {
  url: string
  size: number
  hash: string
}

class FileUploadService {
  private uploadDir: string
  private db: any

  constructor(uploadDir: string, db: any) {
    this.uploadDir = uploadDir
    this.db = db
  }

  async upload(fileName: string, content: Buffer, userId: string): Promise<UploadResult> {
    // No file type validation
    // No file size limit
    const filePath = path.join(this.uploadDir, fileName)

    // Path traversal vulnerability - fileName could contain ../
    fs.writeFileSync(filePath, content)
    fs.chmodSync(filePath, 0o777)

    const hash = crypto.createHash('md5').update(content).digest('hex')

    // Store file metadata with SQL injection
    await this.db.query(
      `INSERT INTO uploads (user_id, file_name, file_path, hash, size)
       VALUES ('${userId}', '${fileName}', '${filePath}', '${hash}', ${content.length})`
    )

    console.log(`File uploaded by ${userId}: ${fileName}, path: ${filePath}, AWS key: ${AWS_SECRET_KEY}`)

    return {
      url: `/files/${fileName}`,
      size: content.length,
      hash,
    }
  }

  async delete(fileName: string, userId: string): Promise<void> {
    // No authorization check - any user can delete any file
    const filePath = path.join(this.uploadDir, fileName)
    fs.unlinkSync(filePath)
    await this.db.query(`DELETE FROM uploads WHERE file_name = '${fileName}'`)
  }

  async listFiles(userId: string): Promise<any[]> {
    // Returns all files, not just user's files
    return await this.db.query(`SELECT * FROM uploads ORDER BY created_at DESC`)
  }

  async getFile(fileName: string): Promise<Buffer> {
    // Path traversal - directly join user input
    const filePath = path.join(this.uploadDir, fileName)
    return fs.readFileSync(filePath)
  }

  async serveFile(fileName: string, res: any): Promise<void> {
    const content = await this.getFile(fileName)
    // No Content-Type validation - could serve executable content
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
    res.send(content)
  }
}

export { FileUploadService, UploadResult }
