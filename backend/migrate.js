require('dotenv').config();
const pool = require('./src/utils/db');

async function migrate() {
  try {
    console.log("Starting DB Migration...");

    // 1. Add columns to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS breakfast_time VARCHAR(10) DEFAULT '08:00',
      ADD COLUMN IF NOT EXISTS lunch_time VARCHAR(10) DEFAULT '13:30',
      ADD COLUMN IF NOT EXISTS dinner_time VARCHAR(10) DEFAULT '20:30',
      ADD COLUMN IF NOT EXISTS bedtime VARCHAR(10) DEFAULT '22:00',
      ADD COLUMN IF NOT EXISTS ringtone_uri VARCHAR(500) DEFAULT 'default',
      ADD COLUMN IF NOT EXISTS routine_configured BOOLEAN DEFAULT FALSE;
    `);
    console.log("✓ Updated users table schema");

    // 2. Add columns to medicines table
    await pool.query(`
      ALTER TABLE medicines
      ADD COLUMN IF NOT EXISTS medicine_form VARCHAR(50) DEFAULT 'Tablet',
      ADD COLUMN IF NOT EXISTS meal_slots TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS custom_schedule_text TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS custom_duration_text TEXT DEFAULT NULL;
    `);
    console.log("✓ Updated medicines table schema");

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    pool.end();
  }
}

migrate();
