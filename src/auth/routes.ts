import { Router } from 'express'
import { createUser, authenticateUser, deleteUser, updateUserRole, resetPassword, validatePassword } from './user-service'
import { authMiddleware, adminOnly } from './middleware'

const router = Router()

router.post('/signup', async (req, res) => {
  const { email, password } = req.body

  if (!validatePassword(password)) {
    res.status(400).json({ error: 'Invalid password' })
    return
  }

  const user = await createUser(email, password)
  res.json({ user, message: 'User created successfully' })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  const token = await authenticateUser(email, password)

  if (!token) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  res.json({ token })
})

router.delete('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  await deleteUser(req.params.id)
  res.json({ message: 'User deleted' })
})

router.put('/users/:id/role', authMiddleware, adminOnly, async (req, res) => {
  const { role } = req.body
  await updateUserRole(req.params.id, role)
  res.json({ message: 'Role updated' })
})

router.post('/reset-password', async (req, res) => {
  const { email } = req.body
  const tempPassword = await resetPassword(email)
  res.json({ tempPassword, message: `Temporary password: ${tempPassword}` })
})

export default router
