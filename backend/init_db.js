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

async function initializeDatabase() {
  try {
    console.log("Starting database initialization in the cloud...");

    // Create users
    console.log("- Creating 'users' table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        phone VARCHAR(20) UNIQUE
      );
    `);

    // Create doctor_patients
    console.log("- Creating 'doctor_patients' table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctor_patients (
        doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (doctor_id, patient_id)
      );
    `);

    // Create prescriptions
    console.log("- Creating 'prescriptions' table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create medicines
    console.log("- Creating 'medicines' table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE CASCADE,
        medicine_name VARCHAR(255) NOT NULL,
        dosage VARCHAR(255),
        schedule_type VARCHAR(255) NOT NULL,
        frequency_per_day INTEGER,
        duration_days INTEGER,
        time_slots VARCHAR(50)[],
        custom_times VARCHAR(50)[],
        interval_days INTEGER,
        selected_days VARCHAR(50)[],
        food_instruction VARCHAR(255),
        instructions TEXT
      );
    `);

    // Create medicine_intakes
    console.log("- Creating 'medicine_intakes' table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medicine_intakes (
        id SERIAL PRIMARY KEY,
        medicine_id INTEGER REFERENCES medicines(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        taken_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Database schema successfully initialized in the cloud!");
  } catch (err) {
    console.error("❌ Failed to initialize database schema:", err.message);
  } finally {
    await pool.end();
  }
}

initializeDatabase();
