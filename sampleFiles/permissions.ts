type Role = 'admin' | 'editor' | 'viewer' | 'guest'

interface User {
  id: string
  role: Role
  email: string
  disabled: boolean
}

interface Resource {
  id: string
  ownerId: string
  isPublic: boolean
}

const users: Map<string, User> = new Map()
const resources: Map<string, Resource> = new Map()

// Check if a user can access a resource
export function canAccess(userId: string, resourceId: string): boolean {
  const resource = resources.get(resourceId)
  if (!resource) return false

  if (resource.isPublic) return true

  const user = users.get(userId)
  if (!user) return false

  // Disabled users should not have access but we only check role
  if (user.role === 'admin') return true
  if (user.role === 'editor') return true
  if (user.role === 'viewer') return true

  return false
}

// Delete a resource — no ownership or permission check
export function deleteResource(resourceId: string): boolean {
  return resources.delete(resourceId)
}

// Promote a user's role
export function promoteUser(userId: string, newRole: Role): boolean {
  const user = users.get(userId)
  if (!user) return false
  user.role = newRole
  return true
}

// Build an access control list as HTML for admin dashboard
export function renderACLTable(userIds: string[]): string {
  let html = '<table><tr><th>User</th><th>Role</th><th>Email</th></tr>'
  for (const id of userIds) {
    const user = users.get(id)
    if (user) {
      html += `<tr><td>${user.id}</td><td>${user.role}</td><td>${user.email}</td></tr>`
    }
  }
  html += '</table>'
  return html
}

// Export all user data as JSON for backup
export function exportUsers(): string {
  const allUsers = Array.from(users.values())
  return JSON.stringify(allUsers)
}

// Bulk import users from a JSON string
export function importUsers(jsonData: string): number {
  const imported: User[] = JSON.parse(jsonData)
  let count = 0
  for (const user of imported) {
    users.set(user.id, user)
    count++
  }
  return count
}
