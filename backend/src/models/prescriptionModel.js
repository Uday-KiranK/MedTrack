const pool = require("../utils/db");

const createPrescription = async (doctorId, patientId) => {
  const res = await pool.query(
    "INSERT INTO prescriptions (doctor_id, patient_id) VALUES ($1,$2) RETURNING *",
    [doctorId, patientId]
  );
  return res.rows[0];
};

const { deductStock } = require("./inventoryModel");

const addMedicine = async (data) => {
  const {
    prescription_id,
    medicine_name,
    dosage,
    schedule_type,
    frequency_per_day,
    duration_days,
    time_slots,
    custom_times,
    interval_days,
    selected_days,
    food_instruction,
    instructions,
    availability_source = 'buy_outside'
  } = data;

  const res = await pool.query(
    `INSERT INTO medicines (
      prescription_id, medicine_name, dosage, schedule_type,
      frequency_per_day, duration_days, time_slots,
      custom_times, interval_days, selected_days,
      food_instruction, instructions, availability_source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    [
      prescription_id,
      medicine_name,
      dosage,
      schedule_type,
      frequency_per_day,
      duration_days,
      time_slots,
      custom_times,
      interval_days,
      selected_days,
      food_instruction,
      instructions,
      availability_source
    ]
  );

  const insertedMed = res.rows[0];

  // If item is from clinic pharmacy, auto-deduct stock
  if (availability_source === 'clinic_pharmacy') {
    try {
      // Find doctor_id for this prescription
      const pRes = await pool.query(`SELECT doctor_id FROM prescriptions WHERE id = $1`, [prescription_id]);
      if (pRes.rows.length > 0) {
        const doctorId = pRes.rows[0].doctor_id;
        await deductStock(doctorId, medicine_name, 1);
      }
    } catch (e) {
      console.error("Auto deduct stock error:", e.message);
    }
  }

  return insertedMed;
};

const getMedicinesForPatient = async (patientId) => {
  const res = await pool.query(
    `
    SELECT m.*, p.patient_id, d.name AS doctor_name, p.created_at AS start_date,
           COALESCE(json_agg(i.taken_at ORDER BY i.taken_at DESC) FILTER (WHERE i.taken_at IS NOT NULL), '[]') AS intakes
    FROM medicines m
    JOIN prescriptions p ON p.id = m.prescription_id
    JOIN users d ON p.doctor_id = d.id
    LEFT JOIN medicine_intakes i ON i.medicine_id = m.id
    WHERE p.patient_id = $1
    GROUP BY m.id, p.patient_id, d.name, p.created_at
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
    SELECT m.*, p.patient_id, p.doctor_id, p.created_at AS start_date,
           COALESCE(json_agg(i.taken_at ORDER BY i.taken_at DESC) FILTER (WHERE i.taken_at IS NOT NULL), '[]') AS intakes
    FROM medicines m
    JOIN prescriptions p ON p.id = m.prescription_id
    LEFT JOIN medicine_intakes i ON i.medicine_id = m.id
    WHERE p.doctor_id = $1 AND p.patient_id = $2
    GROUP BY m.id, p.patient_id, p.doctor_id, p.created_at
    `,
    [doctorId, patientId]
  );
  return res.rows;
};

const recordIntake = async (medicineId, patientId) => {
  const res = await pool.query(
    "INSERT INTO medicine_intakes (medicine_id, patient_id) VALUES ($1, $2) RETURNING *",
    [medicineId, patientId]
  );
  return res.rows[0];
};

module.exports = {
  createPrescription,
  addMedicine,
  getMedicinesForPatient,
  editMedicine,
  getDoctorPatientPrescriptions,
  recordIntake
};

