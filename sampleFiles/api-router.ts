import { addUser, login, getAllUsers, removeUser, getSystemInfo } from './user-service'
import { adminLogin, promoteUser, dashboardData, getFullUserExport, runDiagnostics } from './admin-controller'
import { logAction, searchLogs, exportLogsAsJson } from './audit-logger'

type Handler = (req: any, res: any) => void

const routes: Map<string, Handler> = new Map()

// Public routes
routes.set('POST /register', (req, res) => {
  const { name, email, password } = req.body
  const user = addUser(name, email, password)
  logAction(user.id, 'register', `New user: ${email}`, req.ip, req.headers['user-agent'])
  res.json(user)
})

routes.set('POST /login', (req, res) => {
  const { email, password } = req.body
  const token = login(email, password)
  if (token) {
    logAction(email, 'login', 'Successful login', req.ip, req.headers['user-agent'])
    res.json({ token })
  } else {
    logAction(email, 'login_failed', 'Failed login attempt', req.ip, req.headers['user-agent'])
    res.status(401).json({ error: 'Invalid credentials' })
  }
})

// Admin routes - no middleware auth check
routes.set('GET /admin/users', (req, res) => {
  res.json(getAllUsers())
})

routes.set('DELETE /admin/users/:id', (req, res) => {
  const deleted = removeUser(req.params.id)
  res.json({ deleted })
})

routes.set('POST /admin/promote', (req, res) => {
  const { userId, token } = req.body
  const result = promoteUser(userId, token)
  res.json({ promoted: result })
})

routes.set('GET /admin/dashboard', (req, res) => {
  res.json(dashboardData())
})

routes.set('GET /admin/export', (req, res) => {
  const data = getFullUserExport(req.headers.authorization)
  res.setHeader('Content-Type', 'application/json')
  res.send(data)
})

routes.set('GET /admin/diagnostics', (req, res) => {
  res.json(runDiagnostics())
})

routes.set('GET /admin/system', (req, res) => {
  res.json(getSystemInfo())
})

// Audit routes
routes.set('GET /audit/search', (req, res) => {
  const results = searchLogs(req.query.q)
  res.json(results)
})

routes.set('GET /audit/export', (req, res) => {
  res.json(JSON.parse(exportLogsAsJson()))
})

export function handleRequest(method: string, path: string, req: any, res: any): void {
  const routeKey = `${method} ${path}`
  const handler = routes.get(routeKey)
  if (handler) {
    handler(req, res)
  } else {
    res.status(404).json({ error: 'Not found' })
  }
}

export { routes }
