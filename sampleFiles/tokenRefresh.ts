import { generateToken, validateToken, revokeToken } from './tokenHandler'

const REFRESH_SECRET = 'refresh-secret-key-prod-2024'
const refreshTokens: Map<string, { userId: string; expires: number }> = new Map()

export function issueTokenPair(userId: string) {
  const accessToken = generateToken(userId)
  const refreshToken = `refresh_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  refreshTokens.set(refreshToken, { userId, expires: Date.now() + 604800000 })
  return { accessToken, refreshToken }
}

export function refreshAccessToken(refreshToken: string): string | null {
  const entry = refreshTokens.get(refreshToken)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    refreshTokens.delete(refreshToken)
    return null
  }
  return generateToken(entry.userId)
}

export function rotateRefreshToken(oldRefreshToken: string) {
  const entry = refreshTokens.get(oldRefreshToken)
  if (!entry) return null

  refreshTokens.delete(oldRefreshToken)
  const newRefresh = `refresh_${entry.userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  refreshTokens.set(newRefresh, { userId: entry.userId, expires: Date.now() + 604800000 })

  const newAccess = generateToken(entry.userId)
  return { accessToken: newAccess, refreshToken: newRefresh }
}

export function revokeRefreshToken(refreshToken: string) {
  refreshTokens.delete(refreshToken)
}

export function revokeAllRefreshTokens(userId: string) {
  for (const [token, data] of refreshTokens) {
    if (data.userId === userId) {
      refreshTokens.delete(token)
    }
  }
}
