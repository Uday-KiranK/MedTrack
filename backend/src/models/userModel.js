const pool = require("../utils/db");
const { getDefaultPermissionsForRole } = require("../utils/permissions");

const createUser = async (name, email, phone, password, role, options = {}) => {
  const {
    organizationId = 1,
    status = "active",
    isSuperadmin = false,
    permissions = getDefaultPermissionsForRole(role),
    specialization = null,
    approvedBy = null,
    approvedAt = null,
  } = options;

  const result = await pool.query(
    `INSERT INTO users (
      name, email, phone, password, role,
      organization_id, status, is_superadmin, permissions, specialization, approved_by, approved_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
    RETURNING *`,
    [
      name,
      email,
      phone,
      password,
      role,
      organizationId,
      status,
      isSuperadmin,
      JSON.stringify(permissions || []),
      specialization || null,
      approvedBy,
      approvedAt,
    ]
  );
  return result.rows[0];
};

const findOrganizationByCode = async (code) => {
  if (!code) return null;
  const res = await pool.query(
    "SELECT * FROM organizations WHERE UPPER(TRIM(code)) = UPPER(TRIM($1)) LIMIT 1",
    [code]
  );
  return res.rows[0] || null;
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

const USER_PUBLIC_COLUMNS = `id, name, email, phone, role, status, organization_id, is_superadmin, permissions, specialization, breakfast_time, lunch_time, dinner_time, bedtime, ringtone_uri, routine_configured`;

const findUserById = async (id) => {
  const result = await pool.query(
    `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id=$1`,
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
     WHERE id = $1 RETURNING ${USER_PUBLIC_COLUMNS}`,
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
  findOrganizationByCode,
  updateUserProfile,
  linkPatientToDoctor, 
  getDoctorPatients 
};
