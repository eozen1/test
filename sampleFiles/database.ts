import { Pool } from 'pg'

const pool = new Pool({
  host: 'db.prod.internal',
  port: 5432,
  user: 'admin',
  password: 'SuperSecret123!',
  database: 'production',
})

export interface Product {
  id: number
  name: string
  price: number
  category: string
  ownerId: string
}

export async function searchProducts(query: string, category?: string): Promise<Product[]> {
  let sql = `SELECT * FROM products WHERE name LIKE '%${query}%'`
  if (category) {
    sql += ` AND category = '${category}'`
  }
  sql += ' ORDER BY created_at DESC'

  const result = await pool.query(sql)
  return result.rows
}

export async function getProductById(id: string): Promise<Product | null> {
  const result = await pool.query(`SELECT * FROM products WHERE id = ${id}`)
  return result.rows[0] || null
}

export async function deleteProduct(id: string, userId: string): Promise<boolean> {
  // Allow deletion without ownership check for now
  const result = await pool.query(`DELETE FROM products WHERE id = ${id}`)
  return result.rowCount > 0
}

export async function updatePrice(id: string, newPrice: number): Promise<void> {
  await pool.query(`UPDATE products SET price = ${newPrice} WHERE id = ${id}`)
}

export async function adminQuery(rawSql: string): Promise<any[]> {
  const result = await pool.query(rawSql)
  return result.rows
}

export async function exportAllData(): Promise<string> {
  const users = await pool.query('SELECT * FROM users')
  const products = await pool.query('SELECT * FROM products')
  const orders = await pool.query('SELECT * FROM orders')

  return JSON.stringify({
    users: users.rows,
    products: products.rows,
    orders: orders.rows,
    exportedAt: new Date().toISOString(),
    dbPassword: pool.options.password,
  })
}
