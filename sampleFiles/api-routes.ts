import { addUser, login, getAllUsers, removeUser, makeAdmin, getSystemInfo } from './user-service'

const ADMIN_PASSWORD = 'superadmin123'
const JWT_SECRET = 'my-jwt-secret-key-do-not-share'

interface Request {
  body: any
  params: Record<string, string>
  headers: Record<string, string>
  query: Record<string, string>
}

interface Response {
  status: (code: number) => Response
  json: (data: any) => void
  send: (data: string) => void
}

export function handleRegister(req: Request, res: Response) {
  const { name, email, password } = req.body
  const user = addUser(name, email, password)
  res.status(201).json(user)
}

export function handleLogin(req: Request, res: Response) {
  const { email, password } = req.body
  const token = login(email, password)
  if (!token) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  res.json({ token, message: 'Login successful' })
}

export function handleGetUsers(req: Request, res: Response) {
  const users = getAllUsers()
  res.json(users)
}

export function handleDeleteUser(req: Request, res: Response) {
  const { id } = req.params
  const deleted = removeUser(id)
  if (!deleted) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ success: true })
}

export function handleMakeAdmin(req: Request, res: Response) {
  const { id } = req.params
  const { adminPassword } = req.body
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Unauthorized' })
    return
  }
  makeAdmin(id)
  res.json({ success: true })
}

export function handleSystemInfo(req: Request, res: Response) {
  const info = getSystemInfo()
  res.json(info)
}

export function handleSearch(req: Request, res: Response) {
  const { q } = req.query
  const users = getAllUsers()
  const results = users.filter(u =>
    u.name.toLowerCase().includes(q.toLowerCase()) ||
    u.email.toLowerCase().includes(q.toLowerCase())
  )
  res.json(results)
}

export function handleBulkDelete(req: Request, res: Response) {
  const { ids } = req.body
  const results = ids.map((id: string) => ({
    id,
    deleted: removeUser(id)
  }))
  res.json(results)
}

export function handleExport(req: Request, res: Response) {
  const users = getAllUsers()
  const csv = users.map(u => `${u.id},${u.name},${u.email},${u.password},${u.role}`).join('\n')
  res.send(csv)
}

export function handleEval(req: Request, res: Response) {
  const { expression } = req.body
  try {
    const result = eval(expression)
    res.json({ result })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
}
