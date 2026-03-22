const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Run a SELECT, return all rows
async function query(sql, params = []) {
  const result = await pool.query(toPostgres(sql), params);
  return result.rows;
}

// Run a SELECT, return first row or null
async function queryOne(sql, params = []) {
  const result = await pool.query(toPostgres(sql), params);
  return result.rows[0] || null;
}

// Run INSERT / UPDATE / DELETE — returns { changes, lastInsertRowid }
async function run(sql, params = []) {
  const result = await pool.query(toPostgres(sql), params);
  return {
    changes: result.rowCount,
    lastInsertRowid: result.rows[0]?.id ?? null,
  };
}

// Execute raw SQL (schema migrations)
async function exec(sql) {
  await pool.query(sql);
}

// Run multiple statements in a transaction
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn({
      query:    (sql, p = []) => client.query(toPostgres(sql), p).then(r => r.rows),
      queryOne: (sql, p = []) => client.query(toPostgres(sql), p).then(r => r.rows[0] || null),
      run:      (sql, p = []) => client.query(toPostgres(sql), p).then(r => ({ changes: r.rowCount, lastInsertRowid: r.rows[0]?.id })),
    });
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { query, queryOne, run, exec, transaction, pool };
