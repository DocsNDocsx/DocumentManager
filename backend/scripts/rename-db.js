/**
 * Renames the local MySQL database from `dashdoxs` to `docsndocs`.
 * MySQL has no RENAME DATABASE command, so this script:
 *   1. Creates the new database `docsndocs`
 *   2. Moves every table from `dashdoxs` into `docsndocs`
 *   3. Drops the now-empty `dashdoxs` database
 *
 * Run once: node scripts/rename-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const OLD_DB = 'dashdoxs';
const NEW_DB = 'docsndocs';

async function run() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST ?? 'localhost',
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    console.log(`Creating database \`${NEW_DB}\`...`);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${NEW_DB}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    const [tables] = await conn.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? ORDER BY table_name`,
      [OLD_DB]
    );

    if (tables.length === 0) {
      console.log(`No tables found in \`${OLD_DB}\`. Nothing to move.`);
    } else {
      console.log(`Moving ${tables.length} tables: ${tables.map(t => t.table_name ?? t.TABLE_NAME).join(', ')}`);
      for (const row of tables) {
        const table = row.table_name ?? row.TABLE_NAME;
        await conn.query(
          `RENAME TABLE \`${OLD_DB}\`.\`${table}\` TO \`${NEW_DB}\`.\`${table}\``
        );
        console.log(`  ✓ ${table}`);
      }
    }

    console.log(`Dropping old database \`${OLD_DB}\`...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${OLD_DB}\``);

    console.log(`\nDone. Database renamed: ${OLD_DB} → ${NEW_DB}`);
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('Rename failed:', err.message);
  process.exit(1);
});
