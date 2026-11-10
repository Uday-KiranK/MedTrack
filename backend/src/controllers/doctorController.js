const pool = require("../utils/db");
const { findUserByPhone, linkPatientToDoctor, getDoctorPatients } = require("../models/userModel");

exports.addPatientByPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    const doctorId = req.user.id;
    const orgId = req.user.organization_id || 1;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const patient = await findUserByPhone(phone);
    if (!patient || patient.organization_id !== orgId || patient.status !== "active") {
      return res.status(404).json({ message: "No active patient found in your clinic with this phone number" });
    }

    if (patient.role !== "patient") {
      return res.status(400).json({ message: "User is not registered as a patient" });
    }

    const linked = await linkPatientToDoctor(doctorId, patient.id, {
      organizationId: orgId,
      assignedBy: doctorId,
    });

    res.status(201).json({
      message: "Patient added successfully",
      patient: { id: patient.id, name: patient.name, phone: patient.phone },
      mapping: linked,
    });
  } catch (error) {
    console.error("Add patient error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMyPatients = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const orgId = req.user.organization_id || 1;
    const patients = await getDoctorPatients(doctorId, orgId);
    res.json(patients);
  } catch (error) {
    console.error("Get patients error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMyAppointments = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const orgId = req.user.organization_id || 1;
    const { date, status } = req.query;

    const conds = ["a.doctor_id = $1", "a.organization_id = $2"];
    const params = [doctorId, orgId];
    let idx = 3;

    if (date) {
      conds.push(`a.appointment_date = $${idx++}`);
      params.push(date);
    }
    if (status && status !== "all") {
      conds.push(`a.status = $${idx++}`);
      params.push(status);
    }

    const result = await pool.query(
      `SELECT a.*, u.name AS patient_name, u.phone AS patient_phone
       FROM appointments a
       JOIN users u ON a.patient_id = u.id
       WHERE ${conds.join(" AND ")}
       ORDER BY a.appointment_date ASC, a.slot_time ASC`,
      params
    );
    res.json({ success: true, appointments: result.rows });
  } catch (error) {
    console.error("Get doctor appointments error:", error);
    res.status(500).json({ success: false, message: "Server error loading appointments" });
  }
};

exports.updateMyAppointmentStatus = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;
    const { status } = req.body || {};

    const allowed = ["in_consultation", "completed", "no_show"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status transition for doctor" });
    }

    const resUpd = await pool.query(
      `UPDATE appointments
       SET status = $3, updated_at = NOW()
       WHERE id = $1 AND doctor_id = $2 AND organization_id = $4
       RETURNING *`,
      [id, doctorId, status, orgId]
    );
    if (resUpd.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Appointment not found for your account" });
    }
    res.json({ success: true, appointment: resUpd.rows[0] });
  } catch (error) {
    console.error("Doctor update appointment status error:", error);
    res.status(500).json({ success: false, message: "Server error updating appointment" });
  }
};

exports.getMyScheduleAndBlocks = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const orgId = req.user.organization_id || 1;

    const [schedRes, blockRes] = await Promise.all([
      pool.query(
        `SELECT * FROM doctor_schedules WHERE doctor_id = $1 AND organization_id = $2 ORDER BY day_of_week ASC`,
        [doctorId, orgId]
      ),
      pool.query(
        `SELECT * FROM doctor_calendar_blocks
         WHERE doctor_id = $1 AND organization_id = $2 AND block_date >= CURRENT_DATE
         ORDER BY block_date ASC, start_time ASC`,
        [doctorId, orgId]
      ),
    ]);

    res.json({
      success: true,
      schedules: schedRes.rows,
      blocks: blockRes.rows,
    });
  } catch (error) {
    console.error("Doctor get schedule error:", error);
    res.status(500).json({ success: false, message: "Server error loading schedule" });
  }
};
