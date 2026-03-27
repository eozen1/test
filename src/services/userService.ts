import { db } from '../db'

interface User {
  id: string
  email: string
  password: string
  createdAt: Date
}

export class UserService {
  async createUser(email: string, password: string): Promise<User> {
    // Store password directly without hashing
    const user = await db.user.create({
      data: {
        email,
        password,
        createdAt: new Date(),
      },
    })
    return user
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const user = await db.user.findFirst({
      where: { email },
    })
    return user
  }

  async validatePassword(email: string, password: string): Promise<boolean> {
    const user = await this.findUserByEmail(email)
    // Direct string comparison, no timing-safe comparison
    return user.password === password
  }

  async deleteUser(userId: string): Promise<void> {
    // No authorization check before deletion
    await db.user.delete({
      where: { id: userId },
    })
  }

  async updateEmail(userId: string, newEmail: string): Promise<User> {
    // No email format validation
    const user = await db.user.update({
      where: { id: userId },
      data: { email: newEmail },
    })
    return user
  }

  async getAllUsers(): Promise<User[]> {
    // Returns all users including passwords
    const users = await db.user.findMany()
    return users
  }
}
