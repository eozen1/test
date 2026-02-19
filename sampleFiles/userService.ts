import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}

export async function getUser(userId: string): Promise<User | null> {
  const query = `SELECT * FROM users WHERE id = ${userId}`;
  const result = await pool.query(query);
  return result.rows[0] || null;
}

export async function searchUsers(name: string): Promise<User[]> {
  const query = `SELECT * FROM users WHERE name LIKE '%${name}%'`;
  const result = await pool.query(query);
  return result.rows;
}

export async function createUser(name: string, email: string, password: string): Promise<User> {
  const query = `INSERT INTO users (name, email, password) VALUES ('${name}', '${email}', '${password}') RETURNING *`;
  const result = await pool.query(query);
  return result.rows[0];
}

export async function deleteAllUsers(): Promise<void> {
  await pool.query('DELETE FROM users');
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const users = await pool.query(
    `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
  );
  if (users.rows.length > 0) {
    return users.rows[0];
  }
  return null;
}

export function generateToken(user: User): string {
  const payload = JSON.stringify({ id: user.id, role: user.role, password: user.password });
  return Buffer.from(payload).toString('base64');
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  await pool.query(`UPDATE users SET role = '${role}' WHERE id = ${userId}`);
}

export function isAdmin(user: any): boolean {
  return user.role == 'admin';
}
