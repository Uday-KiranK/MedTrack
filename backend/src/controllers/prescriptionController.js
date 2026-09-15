const pool = require("../utils/db.js");

const {
  createPrescription,
  addMedicine,
  getMedicinesForPatient,
  editMedicine,
  getDoctorPatientPrescriptions,
  recordIntake
} = require("../models/prescriptionModel");

exports.createPrescription = async (req, res) => {
  try {
    const { patientId, medicines } = req.body;

    if (!patientId || !Array.isArray(medicines)) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const prescription = await createPrescription(req.user.id, patientId);

    for (const med of medicines) {
      let dosageQty = 1;
      if (med.dosage) {
        const match = med.dosage.toString().match(/(\d+)/);
        if (match) {
          dosageQty = parseInt(match[1], 10) || 1;
        }
      }

      let dosesPerDay = 1;
      if (Array.isArray(med.custom_times) && med.custom_times.length > 0) {
        dosesPerDay = med.custom_times.length;
      } else if (med.frequency_per_day) {
        dosesPerDay = parseInt(med.frequency_per_day, 10) || 1;
      }

      let durationDays = parseInt(med.duration_days, 10) || 1;

      // Total prescribed units = dosageQty * dosesPerDay * durationDays
      const totalUnitsPrescribed = dosageQty * dosesPerDay * durationDays;

      await addMedicine({
        prescription_id: prescription.id,
        medicine_name: med.medicine_name,
        dosage: med.dosage,
        schedule_type: med.schedule_type,
        frequency_per_day: med.frequency_per_day || null,
        duration_days: durationDays,
        time_slots: med.time_slots || null,
        custom_times: med.custom_times || null,
        interval_days: med.interval_days || null,
        selected_days: med.selected_days || null,
        food_instruction: med.food_instruction,
        instructions: med.instructions,
        availability_source: med.availability_source || 'buy_outside',
        total_units: totalUnitsPrescribed
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

exports.editMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const checkOwernship = await pool.query(
      "SELECT p.doctor_id FROM medicines m JOIN prescriptions p ON m.prescription_id = p.id WHERE m.id = $1",
      [id]
    );

    if (checkOwernship.rows.length === 0 || checkOwernship.rows[0].doctor_id !== req.user.id) {
       return res.status(403).json({ message: "Unauthorized to edit this medicine." });
    }

    const updated = await editMedicine(id, data);
    res.json(updated);
  } catch (error) {
    console.error("Edit medicine error", error);
    res.status(500).json({ error: "Server error editing medicine" });
  }
};

exports.getMedicinesForDoctorPatient = async (req, res) => {
  try {
     const { patientId } = req.params;
     const result = await getDoctorPatientPrescriptions(req.user.id, patientId);
     res.json(result);
  } catch (error) {
     console.error("Fetch doctor-patient medicines error", error);
     res.status(500).json({ error: "Server error fetching medicines" });
  }
};

exports.recordIntake = async (req, res) => {
  try {
    const { medicineId } = req.body;
    const patientId = req.user.id;

    if (!medicineId) {
      return res.status(400).json({ message: "medicineId is required" });
    }

    const intake = await recordIntake(medicineId, patientId);
    res.status(201).json({ message: "Intake recorded successfully", intake });
  } catch (error) {
    console.error("Record intake error", error);
    res.status(500).json({ error: "Server error recording intake" });
  }
};
