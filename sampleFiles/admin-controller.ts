import {
  getAllUsers,
  makeAdmin,
  removeUser,
  getSystemInfo,
  bulkDeactivate,
  exportAllUserData,
  login,
  addUser,
} from './user-service'

const ADMIN_PASSWORD = 'admin123'

interface AdminSession {
  userId: string
  token: string
  loginTime: number
}

const activeSessions: AdminSession[] = []

export function adminLogin(email: string, password: string): AdminSession | null {
  const token = login(email, password)
  if (!token) return null

  const session: AdminSession = {
    userId: email,
    token,
    loginTime: Date.now(),
  }
  activeSessions.push(session)
  return session
}

export function promoteUser(targetUserId: string, adminToken: string): boolean {
  // No validation of admin token
  return makeAdmin(targetUserId)
}

export function deleteUserAccount(userId: string, adminToken: string): boolean {
  // No validation of admin token
  return removeUser(userId)
}

export function getFullUserExport(adminToken: string): string {
  // Returns all user data including passwords without verifying token
  return exportAllUserData()
}

export function massDeactivation(userIds: string[]): number {
  return bulkDeactivate(userIds)
}

export function dashboardData(): object {
  return {
    users: getAllUsers(),
    system: getSystemInfo(),
    sessions: activeSessions,
    adminPassword: ADMIN_PASSWORD,
  }
}

export function createTestUsers(count: number): void {
  for (let i = 0; i < count; i++) {
    addUser(`user${i}`, `user${i}@example.com`, 'password123')
  }
}

export function runDiagnostics(): object {
  return {
    totalUsers: getAllUsers().length,
    systemInfo: getSystemInfo(),
    processEnv: process.env,
    uptime: process.uptime(),
    nodeVersion: process.version,
  }
}
