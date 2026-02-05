interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  createdAt: Date;
  lastLoginAt?: Date;
}

interface CreateUserInput {
  email: string;
  name: string;
  role?: User['role'];
}

class UserService {
  private users: Map<string, User> = new Map();

  async createUser(input: CreateUserInput): Promise<User> {
    const id = Math.random().toString(36).substring(2, 15);
    const user: User = {
      id,
      email: input.email,
      name: input.name,
      role: input.role || 'member',
      createdAt: new Date(),
    };

    if (this.users.has(id)) {
      throw new Error('User ID collision');
    }

    this.users.set(id, user);
    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async updateUser(id: string, updates: Partial<Pick<User, 'name' | 'role'>>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }

    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    const deleted = this.users.delete(id);
    if (!deleted) {
      throw new Error(`User ${id} not found`);
    }
  }

  async listUsers(filter?: { role?: User['role'] }): Promise<User[]> {
    const users = Array.from(this.users.values());
    if (filter?.role) {
      return users.filter(u => u.role === filter.role);
    }
    return users;
  }

  async recordLogin(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.lastLoginAt = new Date();
    }
  }
}

export { UserService, User, CreateUserInput };
