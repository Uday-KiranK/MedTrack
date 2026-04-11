require('dotenv').config();
const pool = require('./src/utils/db');

async function wipeDatabase() {
  try {
    console.log('Attempting to TRUNCATE database tables...');
    // Utilizing CASCADE automatically wipes dependant tables (medicines) when prescriptions are wiped.
    // RESTART IDENTITY resets the ID counters back to 1.
    await pool.query('TRUNCATE users, prescriptions, medicines RESTART IDENTITY CASCADE;');
    console.log('✅ Success: All tables completely wiped fresh.');
  } catch(e) {
    console.error('❌ Failed to wipe tables:', e);
  } finally {
    pool.end();
  }
}

wipeDatabase();
