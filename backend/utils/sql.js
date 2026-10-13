const client = process.env.DB_CLIENT ?? 'pg';

let db;

if (client === 'mysql') {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host:     process.env.DB_HOST ?? 'localhost',
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });

  db = {
    async query(sql, params)   { return pool.query(sql, params ?? []); },
    async execute(sql, params) { return pool.execute(sql, params ?? []); },
    async end()                { return pool.end(); },
    async transaction(work) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await work({ query: (sql, params) => connection.query(sql, params ?? []) });
        await connection.commit();
        return result;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
} else {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  function toPostgres(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  db = {
    async query(sql, params) {
      const result = await pool.query(toPostgres(sql), params ?? []);
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
        return [{ affectedRows: result.rowCount, insertId: result.rows[0]?.id ?? null }, result.fields];
      }
      return [result.rows, result.fields];
    },
    async execute(sql, params) {
      return this.query(sql, params);
    },
    async end() {
      return pool.end();
    },
    async transaction(work) {
      const connection = await pool.connect();
      const tx = { async query(sql, params) {
        const result = await connection.query(toPostgres(sql), params ?? []);
        return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
          ? [{ affectedRows: result.rowCount, insertId: result.rows[0]?.id ?? null }, result.fields]
          : [result.rows, result.fields];
      } };
      try {
        await connection.query('BEGIN');
        const result = await work(tx);
        await connection.query('COMMIT');
        return result;
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
    },
  };
}

module.exports = db;
