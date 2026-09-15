require('dotenv').config();
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set in the environment variables!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runV2Migration() {
  try {
    console.log("Starting MedTrack V2 database schema migration...");

    // 1. Create clinic_inventory table
    console.log("- Creating 'clinic_inventory' table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinic_inventory (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        medicine_name VARCHAR(255) NOT NULL,
        brand_name VARCHAR(255),
        strength VARCHAR(100),
        form VARCHAR(100),
        stock_quantity INTEGER DEFAULT 0,
        batch_number VARCHAR(100),
        expiry_date DATE,
        reorder_level INTEGER DEFAULT 10,
        selling_price NUMERIC(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("  ✅ 'clinic_inventory' table ready.");

    // 2. Add availability_source to medicines table if not exists
    console.log("- Adding 'availability_source' column to 'medicines' table...");
    try {
      await pool.query(`
        ALTER TABLE medicines 
        ADD COLUMN IF NOT EXISTS availability_source VARCHAR(50) DEFAULT 'buy_outside';
      `);
      console.log("  ✅ 'availability_source' column ready.");
    } catch (colErr) {
      console.log("  ⚠️ Column notice:", colErr.message);
    }

    console.log("🎉 MedTrack V2 Database migration completed successfully!");
  } catch (err) {
    console.error("❌ V2 Migration failed:", err.message);
  } finally {
    await pool.end();
  }
}

runV2Migration();
