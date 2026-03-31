const pool = require("../utils/db.js"); // or correct path

const {
  createPrescription,
  addMedicine,
  getMedicinesForPatient,
} = require("../models/prescriptionModel");

exports.createPrescription = async (req, res) => {
  try {
    const { patientId, medicines } = req.body;

    if (!patientId || !Array.isArray(medicines)) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const prescription = await createPrescription(req.user.id, patientId);

    for (const med of medicines) {
      await addMedicine({
        prescription_id: prescription.id,
        medicine_name: med.medicine_name,
        dosage: med.dosage,
        schedule_type: med.schedule_type,
        frequency_per_day: med.frequency_per_day || null,
        duration_days: med.duration_days,
        time_slots: med.time_slots || null,
        custom_times: med.custom_times || null,
        interval_days: med.interval_days || null,
        selected_days: med.selected_days || null,
        food_instruction: med.food_instruction,
        instructions: med.instructions,
      });
    }

    res.status(201).json({ message: "Prescription created" });
  } catch (err) {
  console.error("Prescription error:", err);
  res.status(500).json({
    message: "Server error",
    error: err.message,
  });
}

};

exports.getMyMedicines = async (req, res) => {
  const data = await getMedicinesForPatient(req.user.id);
  res.json(data);
};

exports.getDoctorPrescriptions = async (req, res) => {
  try {
    const doctorId = req.user.id;

    const result = await pool.query(
      "SELECT * FROM prescriptions WHERE doctor_id = $1",
      [doctorId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Error fetching doctor prescriptions:", err);
    res.status(500).json({ error: "Server error" });
  }
};

