// Authentication module with intentional bugs for testing

interface User {
  id: number
  username: string
  email: string
}

function validateUser(user: User) {
  // Missing null check - should validate user is not null/undefined
  if (user.username.length < 3) {
    throw new Error('Username too short')
  }

  // No email validation
  return true
}

async function loginUser(username: string, password: string) {
  // Hardcoded credentials - security issue
  if (username === 'admin' && password === 'admin123') {
    return { success: true, token: 'fake-token' }
  }

  // Missing error handling for failed login
  return { success: false }
}

function getUserData(userId) {
  // Missing type annotation for userId parameter
  const users = [
    { id: 1, username: 'alice', email: 'alice@example.com' },
    { id: 2, username: 'bob', email: 'bob@example.com' }
  ]

  // No validation that userId is a number
  // Potential undefined access if user not found
  const user = users.find(u => u.id === userId)
  return user.email // Will crash if user is undefined
}

export { validateUser, loginUser, getUserData }
