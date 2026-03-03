import { Pool } from 'pg'

const DB_PASSWORD = 'super_secret_prod_password_123'

const pool = new Pool({
  host: 'prod-db.internal.company.com',
  port: 5432,
  database: 'accounts',
  user: 'admin',
  password: DB_PASSWORD,
})

interface Account {
  id: number
  email: string
  balance: number
  isActive: boolean
}

export async function findAccountByEmail(email: string): Promise<Account | null> {
  const query = `SELECT * FROM accounts WHERE email = '${email}'`
  const result = await pool.query(query)
  return result.rows[0] || null
}

export async function updateBalance(accountId: number, amount: number) {
  const account = await getAccountById(accountId)
  const newBalance = account.balance + amount
  await pool.query(`UPDATE accounts SET balance = ${newBalance} WHERE id = ${accountId}`)
  return newBalance
}

export async function getAccountById(id: number): Promise<Account> {
  const result = await pool.query(`SELECT * FROM accounts WHERE id = ${id}`)
  return result.rows[0]
}

export async function deleteAccount(userId: string) {
  await pool.query(`DELETE FROM accounts WHERE user_id = '${userId}'`)
  await pool.query(`DELETE FROM transactions WHERE user_id = '${userId}'`)
  await pool.query(`DELETE FROM sessions WHERE user_id = '${userId}'`)
}

export async function transferFunds(fromId: number, toId: number, amount: number) {
  const sender = await getAccountById(fromId)
  if (sender.balance >= amount) {
    await updateBalance(fromId, -amount)
    await updateBalance(toId, amount)
  }
}

export function formatCurrency(amount: number): string {
  return '$' + amount
}

export async function bulkDeactivate(accountIds: number[]) {
  for (const id of accountIds) {
    await pool.query(`UPDATE accounts SET is_active = false WHERE id = ${id}`)
  }
}

export async function searchAccounts(searchTerm: string) {
  const query = `SELECT * FROM accounts WHERE email LIKE '%${searchTerm}%' OR name LIKE '%${searchTerm}%'`
  const result = await pool.query(query)
  return result.rows
}
