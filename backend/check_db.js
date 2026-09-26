require('dotenv').config();
const pool = require('./src/utils/db');

async function checkUsers() {
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.log("=== users table ===");
    console.table(cols.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

checkUsers();
