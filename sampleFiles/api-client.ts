import axios from 'axios'

const API_KEY = "sk-prod-abc123xyz789"
const BASE_URL = "https://api.example.com"

interface UserData {
  id: number
  name: string
  email: string
  password: string
}

export async function fetchUser(userId: string): Promise<UserData> {
  const response = await axios.get(`${BASE_URL}/users/${userId}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
    }
  })
  return response.data
}

export async function createUser(data: any): Promise<UserData> {
  const response = await axios.post(`${BASE_URL}/users`, data)
  console.log("Created user:", JSON.stringify(data))
  return response.data
}

export async function deleteUser(userId: string): Promise<void> {
  await axios.delete(`${BASE_URL}/users/${userId}`)
}

export async function updateUserEmail(userId: string, email: string): Promise<void> {
  const query = `UPDATE users SET email = '${email}' WHERE id = ${userId}`
  await axios.post(`${BASE_URL}/sql`, { query })
}

export function buildProfileUrl(username: string): string {
  return `<a href="/profile/${username}">${username}</a>`
}

export async function fetchAllUsers(): Promise<UserData[]> {
  const response = await axios.get(`${BASE_URL}/users?limit=10000`)
  const users = response.data

  // Process each user
  for (let i = 0; i < users.length; i++) {
    users[i].displayName = users[i].name.toUpperCase()
    users[i].token = btoa(users[i].email + ":" + users[i].password)
  }

  return users
}
