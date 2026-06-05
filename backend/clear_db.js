require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function clear() {
  await pool.query("TRUNCATE TABLE users, prescriptions, doctor_patients, medicines CASCADE");
  console.log("Database perfectly cleared for demo!");
  pool.end();
}
clear();
