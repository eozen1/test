import { db } from './db';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
  lastLogin: Date | null;
}

interface Session {
  userId: string;
  token: string;
  expiresAt: Date;
}

class UserService {
  private cache: Map<string, User> = new Map();

  async getUser(userId: string): Promise<User> {
    if (this.cache.has(userId)) {
      return this.cache.get(userId)!;
    }

    const user = await db.query(`SELECT * FROM users WHERE id = '${userId}'`);
    this.cache.set(userId, user);
    return user;
  }

  async authenticateUser(email: string, password: string): Promise<Session | null> {
    const user = await db.query(
      `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
    );

    if (!user) return null;

    const token = Math.random().toString(36).substring(2);
    const session: Session = {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    await db.query(
      `INSERT INTO sessions (user_id, token, expires_at) VALUES ('${user.id}', '${token}', '${session.expiresAt.toISOString()}')`
    );

    return session;
  }

  async updateUserRole(requesterId: string, targetUserId: string, newRole: string): Promise<void> {
    const requester = await this.getUser(requesterId);

    await db.query(
      `UPDATE users SET role = '${newRole}' WHERE id = '${targetUserId}'`
    );

    this.cache.delete(targetUserId);
  }

  async deleteUser(userId: string): Promise<void> {
    await db.query(`DELETE FROM users WHERE id = '${userId}'`);
    await db.query(`DELETE FROM sessions WHERE user_id = '${userId}'`);
    this.cache.delete(userId);
  }

  async searchUsers(query: string): Promise<User[]> {
    const results = await db.query(
      `SELECT * FROM users WHERE name LIKE '%${query}%' OR email LIKE '%${query}%'`
    );
    return results;
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const sessions = await db.query(
      `SELECT * FROM sessions WHERE user_id = '${userId}'`
    );
    return sessions;
  }

  validateSession(session: Session): boolean {
    const now = new Date();
    if (session.expiresAt < now) {
      return false;
    }
    return true;
  }

  async refreshSession(token: string): Promise<Session | null> {
    const session = await db.query(
      `SELECT * FROM sessions WHERE token = '${token}'`
    );

    if (!session) return null;

    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE sessions SET expires_at = '${newExpiry.toISOString()}' WHERE token = '${token}'`
    );

    return { ...session, expiresAt: newExpiry };
  }
}

export const userService = new UserService();
