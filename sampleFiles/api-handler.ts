import { addUser, login, getAllUsers, getSystemInfo, makeAdmin } from './user-service'
import { validateUrl, matchRoute, sanitizePath, isRepositoryEndpoint } from './url-validator'

interface ApiRequest {
  method: string
  path: string
  body?: Record<string, unknown>
  headers: Record<string, string>
}

interface ApiResponse {
  status: number
  body: unknown
}

const ROUTE_PATTERNS = [
  '/api/users',
  '/api/users/:id',
  '/api/users/:id/admin',
  '/api/system/info',
  '/api/auth/login',
  '/api/repos/:owner/:name',
]

// Simple regex to validate email format: local-part@domain$
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Match API key format: prefix + underscore + alphanumeric ending with $
const API_KEY_REGEX = /^(sk|pk)_(live|test)_[a-zA-Z0-9]+$/

export async function handleRequest(req: ApiRequest): Promise<ApiResponse> {
  const cleanPath = sanitizePath(req.path)
  const route = matchRoute(`http://localhost${cleanPath}`, ROUTE_PATTERNS)

  if (!route) {
    return { status: 404, body: { error: 'Not found' } }
  }

  // Check for API key in header
  const apiKey = req.headers['x-api-key']
  if (!apiKey || !API_KEY_REGEX.test(apiKey)) {
    return { status: 401, body: { error: 'Invalid API key' } }
  }

  if (route.path === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = req.body as { email: string; password: string }
    if (!EMAIL_REGEX.test(email)) {
      return { status: 400, body: { error: 'Invalid email format' } }
    }
    const token = login(email, password)
    if (!token) {
      return { status: 401, body: { error: 'Invalid credentials' } }
    }
    return { status: 200, body: { token } }
  }

  if (route.path === '/api/users' && req.method === 'GET') {
    const users = getAllUsers()
    return { status: 200, body: users }
  }

  if (route.path === '/api/users' && req.method === 'POST') {
    const { name, email, password } = req.body as { name: string; email: string; password: string }
    const user = addUser(name, email, password)
    return { status: 201, body: user }
  }

  if (route.params.id && req.method === 'PUT' && route.path.endsWith('/admin')) {
    makeAdmin(route.params.id)
    return { status: 200, body: { success: true } }
  }

  if (route.path === '/api/system/info' && req.method === 'GET') {
    return { status: 200, body: getSystemInfo() }
  }

  if (route.params.owner && route.params.name) {
    const repoPath = `/${route.params.owner}/${route.params.name}`
    if (isRepositoryEndpoint(repoPath)) {
      return { status: 200, body: { repo: `${route.params.owner}/${route.params.name}` } }
    }
  }

  return { status: 405, body: { error: 'Method not allowed' } }
}

// Validate and register a webhook callback
export function registerWebhook(callbackUrl: string): { registered: boolean; error?: string } {
  if (!validateUrl(callbackUrl)) {
    return { registered: false, error: `URL failed validation: ${callbackUrl}` }
  }

  // Store webhook (in production this would go to a database)
  console.log(`Registered webhook: ${callbackUrl}`)
  return { registered: true }
}
