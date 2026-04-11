const pool = require("../utils/db");

const createPrescription = async (doctorId, patientId) => {
  const res = await pool.query(
    "INSERT INTO prescriptions (doctor_id, patient_id) VALUES ($1,$2) RETURNING *",
    [doctorId, patientId]
  );
  return res.rows[0];
};

const addMedicine = async (data) => {
  const res = await pool.query(
    `INSERT INTO medicines (
      prescription_id, medicine_name, dosage, schedule_type,
      frequency_per_day, duration_days, time_slots,
      custom_times, interval_days, selected_days,
      food_instruction, instructions
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    Object.values(data)
  );
  return res.rows[0];
};

const getMedicinesForPatient = async (patientId) => {
  const res = await pool.query(
    `
    SELECT m.*, p.patient_id
    FROM medicines m
    JOIN prescriptions p ON p.id = m.prescription_id
    WHERE p.patient_id = $1
    `,
    [patientId]
  );
  return res.rows;
};

const editMedicine = async (id, data) => {
  const fields = Object.keys(data).map((key, i) => `${key} = $${i + 2}`).join(", ");
  const values = [id, ...Object.values(data)];

  const res = await pool.query(
    `UPDATE medicines SET ${fields} WHERE id = $1 RETURNING *`,
    values
  );
  return res.rows[0];
};

const getDoctorPatientPrescriptions = async (doctorId, patientId) => {
  const res = await pool.query(
    `
    SELECT m.*, p.patient_id, p.doctor_id
    FROM medicines m
    JOIN prescriptions p ON p.id = m.prescription_id
    WHERE p.doctor_id = $1 AND p.patient_id = $2
    `,
    [doctorId, patientId]
  );
  return res.rows;
};

module.exports = {
  createPrescription,
  addMedicine,
  getMedicinesForPatient,
  editMedicine,
  getDoctorPatientPrescriptions
};
