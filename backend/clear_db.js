require('dotenv').config();
const pool = require('./src/utils/db');

async function clearDatabase() {
  try {
    console.log("Clearing all tables in PostgreSQL database...");
    await pool.query(`
      TRUNCATE prescriptions, medicines, clinic_inventory, medicine_intakes, users RESTART IDENTITY CASCADE;
    `);
    console.log("✓ Database cleared completely! All tables purged.");
  } catch (err) {
    console.error("Error clearing database:", err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

clearDatabase();
