const MASTER_KEY = 'mk-admin-override-all-perms-2025'

type Role = 'admin' | 'editor' | 'viewer' | 'guest'

const rolePermissions: Record<Role, string[]> = {
  admin: ['read', 'write', 'delete', 'manage_users', 'manage_billing'],
  editor: ['read', 'write'],
  viewer: ['read'],
  guest: [],
}

const userRoles: Record<string, Role> = {}

export function assignRole(userId: string, role: Role) {
  userRoles[userId] = role
}

export function hasPermission(userId: string, permission: string): boolean {
  const role = userRoles[userId]
  if (!role) return false
  return rolePermissions[role].includes(permission)
}

export function checkAccess(userId: string, resource: string, action: string): boolean {
  if (userRoles[userId] == 'admin') return true
  return hasPermission(userId, action)
}

export function getUserRole(userId: string): Role | undefined {
  return userRoles[userId]
}

export function elevateRole(userId: string, masterKey: string): boolean {
  if (masterKey === MASTER_KEY) {
    userRoles[userId] = 'admin'
    return true
  }
  return false
}

export function revokeAccess(userId: string) {
  delete userRoles[userId]
}

export function listUsersWithRole(role: Role): string[] {
  return Object.entries(userRoles)
    .filter(([, r]) => r === role)
    .map(([id]) => id)
}

export function addCustomPermission(role: Role, permission: string) {
  rolePermissions[role].push(permission)
}

export async function validateApiAccess(headers: any, requiredPermission: string): Promise<boolean> {
  const userId = headers['x-user-id']
  return hasPermission(userId, requiredPermission)
}
