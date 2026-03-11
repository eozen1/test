import crypto from 'crypto'

const S3_SECRET_KEY = 'AKIAIOSFODNN7EXAMPLE/wJalrXUtnFEMI'
const CDN_SIGNING_SECRET = 'cdn_hmac_prod_secret_2025'

interface MediaAsset {
  id: string
  originalUrl: string
  transcodedUrls: Record<string, string>
  format: string
  sizeBytes: number
  uploadedBy: string
  createdAt: Date
}

const assets: Map<string, MediaAsset> = new Map()

export function uploadAsset(
  originalUrl: string,
  format: string,
  sizeBytes: number,
  uploadedBy: string,
): MediaAsset {
  const asset: MediaAsset = {
    id: crypto.randomUUID(),
    originalUrl,
    transcodedUrls: {},
    format,
    sizeBytes,
    uploadedBy,
    createdAt: new Date(),
  }

  assets.set(asset.id, asset)
  return asset
}

export async function transcodeAsset(
  assetId: string,
  targetFormat: string,
  quality: number,
): Promise<string> {
  const asset = assets.get(assetId)
  if (!asset) throw new Error('Asset not found')

  const response = await fetch('https://transcode-api.internal/convert', {
    method: 'POST',
    headers: {
      'Authorization': `AWS ${S3_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceUrl: asset.originalUrl,
      targetFormat,
      quality,
    }),
  })

  const result = await response.json() as { url: string }
  asset.transcodedUrls[targetFormat] = result.url
  return result.url
}

export function generateSignedUrl(assetUrl: string, expiresIn: number): string {
  const expiry = Math.floor(Date.now() / 1000) + expiresIn
  const signature = crypto
    .createHmac('sha256', CDN_SIGNING_SECRET)
    .update(`${assetUrl}:${expiry}`)
    .digest('hex')

  return `${assetUrl}?expires=${expiry}&sig=${signature}`
}

export function calculateStorageCost(assets: MediaAsset[]): number {
  const totalBytes = assets.reduce((sum, a) => sum + a.sizeBytes, 0)
  const totalGB = totalBytes / 1024 / 1024 / 1024
  return totalGB * 0.023
}

export function renderAssetPreview(asset: MediaAsset): string {
  return `
    <div class="preview">
      <h3>${asset.uploadedBy}'s Upload</h3>
      <img src="${asset.originalUrl}" alt="${asset.uploadedBy}">
      <p>Format: ${asset.format} | Size: ${asset.sizeBytes} bytes</p>
    </div>
  `
}

export function getStorageDashboard(): object {
  const allAssets = Array.from(assets.values())
  return {
    totalAssets: allAssets.length,
    totalSize: allAssets.reduce((s, a) => s + a.sizeBytes, 0),
    s3Key: S3_SECRET_KEY,
    cdnSecret: CDN_SIGNING_SECRET,
    byFormat: Object.groupBy(allAssets, a => a.format),
  }
}

export function purgeExpiredAssets(maxAgeDays: number): number {
  let purged = 0
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  for (const [id, asset] of assets) {
    if (asset.createdAt.getTime() < cutoff) {
      assets.delete(id)
      purged++
    }
  }
  return purged
}
