require('dotenv').config();
const pool = require('./src/utils/db');

async function updateDb() {
  try {
    console.log('Altering users table to add phone number...');
    await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20) UNIQUE;');
    console.log('✅ Added phone column.');
  } catch(e) {
    console.log('⚠️ Phone column may already exist: ', e.message);
  }

  try {
    console.log('Creating doctor_patients table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctor_patients (
        doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (doctor_id, patient_id)
      );
    `);
    console.log('✅ Created doctor_patients table.');
  } catch(e) {
    console.error('❌ Failed to create doctor_patients table:', e);
  } finally {
    pool.end();
  }
}

updateDb();
