const pool = require("../utils/db");

const createUser = async (name, email, phone, password, role) => {
  const result = await pool.query(
    "INSERT INTO users (name, email, phone, password, role) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [name, email, phone, password, role]
  );
  return result.rows[0];
};

const findUserByEmail = async (email) => {
  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );
  return result.rows[0];
};

const findUserByPhone = async (phone) => {
  const result = await pool.query(
    "SELECT * FROM users WHERE phone=$1",
    [phone]
  );
  return result.rows[0];
};

const linkPatientToDoctor = async (doctorId, patientId) => {
  const result = await pool.query(
    "INSERT INTO doctor_patients (doctor_id, patient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *",
    [doctorId, patientId]
  );
  return result.rows[0];
};

const getDoctorPatients = async (doctorId) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone 
     FROM doctor_patients dp 
     JOIN users u ON dp.patient_id = u.id 
     WHERE dp.doctor_id = $1`,
    [doctorId]
  );
  return result.rows;
};

module.exports = { 
  createUser, 
  findUserByEmail, 
  findUserByPhone, 
  linkPatientToDoctor, 
  getDoctorPatients 
};
