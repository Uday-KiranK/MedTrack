const pool = require("../utils/db");

const createUser = async (name, email, phone, password, role) => {
  const result = await pool.query(
    "INSERT INTO users (name, email, phone, password, role) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [name, email, phone, password, role]
  );
  return result.rows[0];
};

const findUserByEmail = async (email) => {
  if (!email) return null;
  const result = await pool.query(
    "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
    [email.trim()]
  );
  return result.rows[0];
};

const findUserByPhone = async (phone) => {
  if (!phone) return null;
  const cleanInput = phone.toString().trim();
  const digitsOnly = cleanInput.replace(/\D/g, '');
  const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

  const result = await pool.query(
    `SELECT * FROM users 
     WHERE phone = $1 
        OR REGEXP_REPLACE(phone, '\\D', '', 'g') = $2 
        OR RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $3`,
    [cleanInput, digitsOnly, last10]
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

const findUserById = async (id) => {
  const result = await pool.query(
    "SELECT id, name, email, phone, role, breakfast_time, lunch_time, dinner_time, bedtime, ringtone_uri, routine_configured FROM users WHERE id=$1",
    [id]
  );
  return result.rows[0];
};

const updateUserProfile = async (id, data) => {
  const {
    name,
    phone,
    breakfast_time,
    lunch_time,
    dinner_time,
    bedtime,
    ringtone_uri,
    routine_configured
  } = data;

  const result = await pool.query(
    `UPDATE users SET 
      name = COALESCE($2, name),
      phone = COALESCE($3, phone),
      breakfast_time = COALESCE($4, breakfast_time),
      lunch_time = COALESCE($5, lunch_time),
      dinner_time = COALESCE($6, dinner_time),
      bedtime = COALESCE($7, bedtime),
      ringtone_uri = COALESCE($8, ringtone_uri),
      routine_configured = COALESCE($9, routine_configured)
     WHERE id = $1 RETURNING id, name, email, phone, role, breakfast_time, lunch_time, dinner_time, bedtime, ringtone_uri, routine_configured`,
    [
      id,
      name || null,
      phone || null,
      breakfast_time || null,
      lunch_time || null,
      dinner_time || null,
      bedtime || null,
      ringtone_uri || null,
      routine_configured !== undefined ? routine_configured : null
    ]
  );
  return result.rows[0];
};

module.exports = { 
  createUser, 
  findUserByEmail, 
  findUserByPhone,
  findUserById,
  updateUserProfile,
  linkPatientToDoctor, 
  getDoctorPatients 
};
