const pool = require("../utils/db");
const { isPatientAssignedToDoctor } = require("../models/userModel");

exports.createCheckup = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id || 1;
    const doctorId = req.user.id;
    const {
      patientId,
      appointmentId = null,
      prescriptionId = null,
      visitDate,
      vitals = {},
      chiefComplaint = "",
      diagnosis = "",
      clinicalNotes = "",
      followUpDate = null,
      completeAppointment = true,
    } = req.body || {};

    if (!patientId) {
      return res.status(400).json({ success: false, message: "patientId is required" });
    }

    const assigned = await isPatientAssignedToDoctor(doctorId, patientId, orgId);
    if (!assigned) {
      return res.status(403).json({
        success: false,
        message: "Access forbidden: Patient is not assigned to you.",
      });
    }

    await client.query("BEGIN");

    let mergedVitals = { ...(vitals || {}) };
    if (appointmentId) {
      const apptRes = await client.query(
        `SELECT * FROM appointments WHERE id = $1 AND organization_id = $2 AND doctor_id = $3 AND patient_id = $4 FOR UPDATE`,
        [appointmentId, orgId, doctorId, patientId]
      );
      if (apptRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Matching appointment not found for this doctor & patient" });
      }
      const apptVitals = apptRes.rows[0].vitals || {};
      mergedVitals = { ...apptVitals, ...mergedVitals };

      if (completeAppointment) {
        await client.query(
          `UPDATE appointments SET status = 'completed', vitals = $2::jsonb, updated_at = NOW() WHERE id = $1`,
          [appointmentId, JSON.stringify(mergedVitals)]
        );
      }
    }

    if (prescriptionId) {
      const rxRes = await client.query(
        `SELECT id FROM prescriptions WHERE id = $1 AND doctor_id = $2 AND patient_id = $3`,
        [prescriptionId, doctorId, patientId]
      );
      if (rxRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Invalid prescriptionId for this doctor & patient" });
      }
    }

    const effectiveDate = visitDate || new Date().toISOString().split("T")[0];
    const insRes = await client.query(
      `INSERT INTO checkups (
        organization_id, appointment_id, doctor_id, patient_id, prescription_id,
        visit_date, vitals, chief_complaint, diagnosis, clinical_notes, follow_up_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
      RETURNING *`,
      [
        orgId,
        appointmentId || null,
        doctorId,
        patientId,
        prescriptionId || null,
        effectiveDate,
        JSON.stringify(mergedVitals),
        chiefComplaint || null,
        diagnosis || null,
        clinicalNotes || null,
        followUpDate || null,
      ]
    );

    await client.query("COMMIT");
    res.status(201).json({ success: true, checkup: insRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create CheckUp Error:", error);
    res.status(500).json({ success: false, message: "Server error saving checkup record" });
  } finally {
    client.release();
  }
};

exports.updateCheckup = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const doctorId = req.user.id;
    const { id } = req.params;
    const { vitals, chiefComplaint, diagnosis, clinicalNotes, followUpDate } = req.body || {};

    const curRes = await pool.query(
      `SELECT * FROM checkups WHERE id = $1 AND organization_id = $2 AND doctor_id = $3`,
      [id, orgId, doctorId]
    );
    if (curRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "CheckUp record not found for your account" });
    }
    const cur = curRes.rows[0];

    const assigned = await isPatientAssignedToDoctor(doctorId, cur.patient_id, orgId);
    if (!assigned) {
      return res.status(403).json({ success: false, message: "Access forbidden: Patient is no longer assigned to you." });
    }

    const updRes = await pool.query(
      `UPDATE checkups
       SET vitals = COALESCE($2::jsonb, vitals),
           chief_complaint = COALESCE($3, chief_complaint),
           diagnosis = COALESCE($4, diagnosis),
           clinical_notes = COALESCE($5, clinical_notes),
           follow_up_date = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        vitals ? JSON.stringify(vitals) : null,
        chiefComplaint !== undefined ? chiefComplaint : null,
        diagnosis !== undefined ? diagnosis : null,
        clinicalNotes !== undefined ? clinicalNotes : null,
        followUpDate !== undefined ? (followUpDate || null) : cur.follow_up_date,
      ]
    );
    res.json({ success: true, checkup: updRes.rows[0] });
  } catch (error) {
    console.error("Update CheckUp Error:", error);
    res.status(500).json({ success: false, message: "Server error updating checkup" });
  }
};

exports.getPatientCheckups = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { patientId } = req.params;

    const patRes = await pool.query(
      `SELECT id, name, phone FROM users WHERE id = $1 AND organization_id = $2 AND role = 'patient'`,
      [patientId, orgId]
    );
    if (patRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Patient not found in your clinic" });
    }

    // Strict entitlement: Doctors can only view CheckUp History of patients assigned to them
    if (req.user.role === "doctor") {
      const assigned = await isPatientAssignedToDoctor(req.user.id, patientId, orgId);
      if (!assigned) {
        return res.status(403).json({
          success: false,
          message: "Access forbidden: Patient is not assigned to you.",
        });
      }
    }

    const checkupsRes = await pool.query(
      `SELECT c.*, doc.name AS doctor_name, doc.specialization,
              a.slot_time, a.visit_type
       FROM checkups c
       JOIN users doc ON c.doctor_id = doc.id
       LEFT JOIN appointments a ON c.appointment_id = a.id
       WHERE c.patient_id = $1 AND c.organization_id = $2
       ORDER BY c.visit_date DESC, c.created_at DESC`,
      [patientId, orgId]
    );

    res.json({
      success: true,
      patient: patRes.rows[0],
      checkups: checkupsRes.rows,
    });
  } catch (error) {
    console.error("Get Patient Checkups Error:", error);
    res.status(500).json({ success: false, message: "Server error loading checkup history" });
  }
};

exports.getMyCheckups = async (req, res) => {
  try {
    const patientId = req.user.id;
    const orgId = req.user.organization_id || 1;

    const checkupsRes = await pool.query(
      `SELECT c.*, doc.name AS doctor_name, doc.specialization,
              a.slot_time, a.visit_type
       FROM checkups c
       JOIN users doc ON c.doctor_id = doc.id
       LEFT JOIN appointments a ON c.appointment_id = a.id
       WHERE c.patient_id = $1 AND c.organization_id = $2
       ORDER BY c.visit_date DESC, c.created_at DESC`,
      [patientId, orgId]
    );

    res.json({ success: true, checkups: checkupsRes.rows });
  } catch (error) {
    console.error("Get My Checkups Error:", error);
    res.status(500).json({ success: false, message: "Server error loading your checkup history" });
  }
};

exports.getUpcomingFollowUps = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    let query;
    let params;

    if (req.user.role === "doctor") {
      query = `
        SELECT c.*, pat.name AS patient_name, pat.phone AS patient_phone, doc.name AS doctor_name
        FROM checkups c
        JOIN users pat ON c.patient_id = pat.id
        JOIN users doc ON c.doctor_id = doc.id
        JOIN doctor_patients dp ON dp.doctor_id = $2 AND dp.patient_id = c.patient_id AND dp.organization_id = $1 AND COALESCE(dp.is_active, TRUE) = TRUE
        WHERE c.organization_id = $1 AND c.follow_up_date IS NOT NULL AND c.follow_up_date >= CURRENT_DATE
        ORDER BY c.follow_up_date ASC`;
      params = [orgId, req.user.id];
    } else {
      query = `
        SELECT c.*, pat.name AS patient_name, pat.phone AS patient_phone, doc.name AS doctor_name, doc.specialization
        FROM checkups c
        JOIN users pat ON c.patient_id = pat.id
        JOIN users doc ON c.doctor_id = doc.id
        WHERE c.organization_id = $1 AND c.follow_up_date IS NOT NULL AND c.follow_up_date >= CURRENT_DATE
        ORDER BY c.follow_up_date ASC`;
      params = [orgId];
    }

    const resFollow = await pool.query(query, params);
    res.json({ success: true, followUps: resFollow.rows });
  } catch (error) {
    console.error("Get FollowUps Error:", error);
    res.status(500).json({ success: false, message: "Server error loading follow-ups" });
  }
};

