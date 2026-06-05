require('dotenv').config();
const pool = require('./src/utils/db');

async function main() {
  try {
    console.log("Creating medicine_intakes table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medicine_intakes (
        id SERIAL PRIMARY KEY,
        medicine_id INTEGER REFERENCES medicines(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        taken_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Created medicine_intakes table successfully.");
  } catch (err) {
    console.error("❌ Failed to create medicine_intakes table:", err.message);
  } finally {
    pool.end();
  }
}

main();
