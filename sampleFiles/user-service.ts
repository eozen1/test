import { validateEmail, validatePassword, validateUsername } from './validators'

interface User {
  id: string
  email: string
  username: string
  createdAt: Date
}

interface CreateUserInput {
  email: string
  username: string
  password: string
}

export class UserService {
  private users: Map<string, User> = new Map()

  async createUser(input: CreateUserInput): Promise<User> {
    const emailValidation = validateEmail(input.email)
    if (!emailValidation.valid) {
      throw new Error(`Invalid email: ${emailValidation.errors.join(', ')}`)
    }

    const usernameValidation = validateUsername(input.username)
    if (!usernameValidation.valid) {
      throw new Error(`Invalid username: ${usernameValidation.errors.join(', ')}`)
    }

    const passwordValidation = validatePassword(input.password)
    if (!passwordValidation.valid) {
      throw new Error(`Invalid password: ${passwordValidation.errors.join(', ')}`)
    }

    const id = crypto.randomUUID()
    const user: User = {
      id,
      email: input.email,
      username: input.username,
      createdAt: new Date(),
    }

    this.users.set(id, user)
    return user
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id)
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id)
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values())
  }
}
