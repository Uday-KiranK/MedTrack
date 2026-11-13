const bcrypt = require("bcrypt");
const pool = require("../utils/db");
const { findUserByEmail, findUserByPhone, createUser, linkPatientToDoctor } = require("../models/userModel");
const { getDefaultPermissionsForRole } = require("../utils/permissions");
const { logAuditEvent } = require("../utils/auditHelper");

const timeToMins = (t) => {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
};

const minsToTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

const getEffectiveScheduleForDay = async (doctorId, orgId, dateStr) => {
  const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const allRes = await pool.query(
    `SELECT * FROM doctor_schedules WHERE doctor_id = $1 AND organization_id = $2`,
    [doctorId, orgId]
  );

  if (allRes.rows.length === 0) {
    // Sensible clinic default: Mon-Sat 09:00-17:00, 30 min slots; Sun closed
    return {
      day_of_week: dayOfWeek,
      start_time: "09:00",
      end_time: "17:00",
      slot_duration_mins: 30,
      is_active: dayOfWeek !== 0,
      is_default: true,
    };
  }

  const row = allRes.rows.find((r) => r.day_of_week === dayOfWeek);
  if (!row) {
    return {
      day_of_week: dayOfWeek,
      start_time: "09:00",
      end_time: "17:00",
      slot_duration_mins: 30,
      is_active: false,
      is_default: false,
    };
  }
  return row;
};

exports.listClinicDoctors = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const resDocs = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.specialization,
              (SELECT COUNT(*)::int FROM doctor_patients dp WHERE dp.doctor_id = u.id AND dp.organization_id = $1 AND COALESCE(dp.is_active, TRUE) = TRUE) AS assigned_patients_count,
              (SELECT COUNT(*)::int FROM appointments a WHERE a.doctor_id = u.id AND a.organization_id = $1 AND a.appointment_date = CURRENT_DATE AND a.status NOT IN ('cancelled', 'no_show')) AS today_appointments_count
       FROM users u
       WHERE u.organization_id = $1 AND u.role = 'doctor' AND u.status = 'active'
       ORDER BY u.name ASC`,
      [orgId]
    );
    res.json({ success: true, doctors: resDocs.rows });
  } catch (error) {
    console.error("Reception List Doctors Error:", error);
    res.status(500).json({ success: false, message: "Server error loading doctors" });
  }
};

exports.getDoctorSchedule = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { doctorId } = req.params;

    const [schedRes, blocksRes] = await Promise.all([
      pool.query(
        `SELECT * FROM doctor_schedules WHERE doctor_id = $1 AND organization_id = $2 ORDER BY day_of_week ASC`,
        [doctorId, orgId]
      ),
      pool.query(
        `SELECT b.*, u.name AS created_by_name
         FROM doctor_calendar_blocks b
         LEFT JOIN users u ON b.created_by = u.id
         WHERE b.doctor_id = $1 AND b.organization_id = $2 AND b.block_date >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY b.block_date ASC, b.start_time ASC`,
        [doctorId, orgId]
      ),
    ]);

    let schedules = schedRes.rows;
    if (schedules.length === 0) {
      schedules = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        day_of_week: d,
        start_time: "09:00",
        end_time: "17:00",
        slot_duration_mins: 30,
        is_active: d !== 0,
        is_default: true,
      }));
    }

    res.json({ success: true, schedules, blocks: blocksRes.rows });
  } catch (error) {
    console.error("Get Doctor Schedule Error:", error);
    res.status(500).json({ success: false, message: "Server error loading schedule" });
  }
};

exports.updateDoctorSchedule = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id || 1;
    const { doctorId } = req.params;
    const { schedules } = req.body || {};

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({ success: false, message: "schedules array is required" });
    }

    const docCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND role = 'doctor' AND status = 'active'`,
      [doctorId, orgId]
    );
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Active doctor not found in clinic" });
    }

    await client.query("BEGIN");
    const saved = [];
    for (const s of schedules) {
      const dow = parseInt(s.day_of_week !== undefined ? s.day_of_week : s.dayOfWeek, 10);
      if (Number.isNaN(dow) || dow < 0 || dow > 6) continue;
      const startTime = s.start_time || s.startTime || "09:00";
      const endTime = s.end_time || s.endTime || "17:00";
      const rawDur = s.slot_duration_mins !== undefined ? s.slot_duration_mins : s.slotDurationMinutes;
      const dur = Math.max(10, Math.min(120, parseInt(rawDur, 10) || 30));
      const isActive = (s.is_active !== undefined ? s.is_active : s.isAvailable) !== false;

      const upRes = await client.query(
        `INSERT INTO doctor_schedules (organization_id, doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (doctor_id, day_of_week) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           slot_duration_mins = EXCLUDED.slot_duration_mins,
           is_active = EXCLUDED.is_active
         RETURNING *`,
        [orgId, doctorId, dow, startTime, endTime, dur, isActive]
      );
      saved.push(upRes.rows[0]);
    }
    await client.query("COMMIT");

    res.json({ success: true, schedules: saved });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update Doctor Schedule Error:", error);
    res.status(500).json({ success: false, message: "Server error updating doctor schedule" });
  } finally {
    client.release();
  }
};

exports.getDoctorAvailableSlots = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { doctorId } = req.params;
    const dateStr = req.query.date || new Date().toISOString().split("T")[0];

    const sched = await getEffectiveScheduleForDay(doctorId, orgId, dateStr);
    const [blocksRes, apptsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM doctor_calendar_blocks WHERE doctor_id = $1 AND organization_id = $2 AND block_date = $3`,
        [doctorId, orgId, dateStr]
      ),
      pool.query(
        `SELECT a.*, u.name AS patient_name, u.phone AS patient_phone
         FROM appointments a
         JOIN users u ON a.patient_id = u.id
         WHERE a.doctor_id = $1 AND a.organization_id = $2 AND a.appointment_date = $3
           AND a.status NOT IN ('cancelled', 'no_show')
         ORDER BY a.slot_time ASC`,
        [doctorId, orgId, dateStr]
      ),
    ]);

    if (!sched.is_active) {
      return res.json({
        success: true,
        date: dateStr,
        schedule: sched,
        slots: [],
        blocks: blocksRes.rows,
        appointments: apptsRes.rows,
        message: "Doctor is off on this day",
      });
    }

    const startMins = timeToMins(sched.start_time);
    const endMins = timeToMins(sched.end_time);
    const dur = sched.slot_duration_mins || 30;
    const slots = [];

    for (let cur = startMins; cur + dur <= endMins; cur += dur) {
      const slotStart = cur;
      const slotEnd = cur + dur;
      const timeLabel = minsToTime(slotStart);
      const endLabel = minsToTime(slotEnd);

      const block = blocksRes.rows.find((b) => {
        if (b.is_full_day) return true;
        return intervalsOverlap(slotStart, slotEnd, timeToMins(b.start_time), timeToMins(b.end_time));
      });

      const booked = apptsRes.rows.find((a) =>
        intervalsOverlap(slotStart, slotEnd, timeToMins(a.slot_time), timeToMins(a.end_time))
      );

      let status = "available";
      if (block) status = "blocked";
      else if (booked) status = "booked";

      slots.push({
        time: timeLabel,
        endTime: endLabel,
        status,
        blockReason: block ? (block.reason || "Blocked") : null,
        appointment: booked || null,
      });
    }

    res.json({
      success: true,
      date: dateStr,
      schedule: sched,
      slots,
      blocks: blocksRes.rows,
      appointments: apptsRes.rows,
    });
  } catch (error) {
    console.error("Get Doctor Slots Error:", error);
    res.status(500).json({ success: false, message: "Server error calculating doctor slots" });
  }
};

exports.createCalendarBlock = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { doctorId } = req.params;
    const { blockDate, startTime = "00:00", endTime = "23:59", isFullDay = false, reason = "", force = false, cancelConflicts = false } = req.body || {};

    if (!blockDate) {
      return res.status(400).json({ success: false, message: "blockDate (YYYY-MM-DD) is required" });
    }

    const docCheck = await pool.query(
      `SELECT id, name FROM users WHERE id = $1 AND organization_id = $2 AND role = 'doctor' AND status = 'active'`,
      [doctorId, orgId]
    );
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Doctor not found in your clinic" });
    }

    const effectiveStart = isFullDay ? "00:00" : startTime;
    const effectiveEnd = isFullDay ? "23:59" : endTime;

    if (!isFullDay && timeToMins(effectiveEnd) <= timeToMins(effectiveStart)) {
      return res.status(400).json({ success: false, message: "endTime must be after startTime" });
    }

    // Check overlapping active appointments
    const apptsRes = await pool.query(
      `SELECT a.*, u.name AS patient_name, u.phone AS patient_phone
       FROM appointments a
       JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = $1 AND a.organization_id = $2 AND a.appointment_date = $3
         AND a.status NOT IN ('cancelled', 'no_show', 'completed')`,
      [doctorId, orgId, blockDate]
    );

    const conflicts = apptsRes.rows.filter((a) =>
      isFullDay || intervalsOverlap(timeToMins(effectiveStart), timeToMins(effectiveEnd), timeToMins(a.slot_time), timeToMins(a.end_time))
    );

    if (conflicts.length > 0 && !force) {
      return res.status(409).json({
        success: false,
        conflict: true,
        conflicts,
        message: `Doctor has ${conflicts.length} active appointment(s) during this window. Cancel/reschedule or force block.`,
      });
    }

    if (conflicts.length > 0 && cancelConflicts) {
      const ids = conflicts.map((c) => c.id);
      await pool.query(
        `UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = ANY($1::int[])`,
        [ids]
      );
    }

    const inserted = await pool.query(
      `INSERT INTO doctor_calendar_blocks (organization_id, doctor_id, block_date, start_time, end_time, is_full_day, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [orgId, doctorId, blockDate, effectiveStart, effectiveEnd, !!isFullDay, reason || null, req.user.id]
    );

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "reception_blocked_calendar",
      targetUserId: parseInt(doctorId, 10),
      details: { blockDate, effectiveStart, effectiveEnd, isFullDay, reason },
    });

    res.status(201).json({ success: true, block: inserted.rows[0], cancelledConflicts: cancelConflicts ? conflicts.length : 0 });
  } catch (error) {
    console.error("Create Calendar Block Error:", error);
    res.status(500).json({ success: false, message: "Server error blocking doctor calendar" });
  }
};

exports.deleteCalendarBlock = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { blockId } = req.params;
    const del = await pool.query(
      `DELETE FROM doctor_calendar_blocks WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [blockId, orgId]
    );
    if (del.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Calendar block not found" });
    }
    res.json({ success: true, message: "Calendar block removed" });
  } catch (error) {
    console.error("Delete Calendar Block Error:", error);
    res.status(500).json({ success: false, message: "Server error removing calendar block" });
  }
};

exports.listPatients = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { q } = req.query;
    const params = [orgId];
    let qFilter = "";
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      qFilter = `AND (u.name ILIKE $2 OR u.phone ILIKE $2 OR u.email ILIKE $2)`;
    }

    const resPats = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.created_at,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('doctor_id', d.id, 'doctor_name', d.name, 'specialization', d.specialization))
                FILTER (WHERE d.id IS NOT NULL AND COALESCE(dp.is_active, TRUE) = TRUE),
                '[]'
              ) AS assigned_doctors,
              MAX(a.appointment_date) AS last_appointment_date
       FROM users u
       LEFT JOIN doctor_patients dp ON dp.patient_id = u.id AND dp.organization_id = $1
       LEFT JOIN users d ON dp.doctor_id = d.id AND d.status = 'active'
       LEFT JOIN appointments a ON a.patient_id = u.id AND a.organization_id = $1
       WHERE u.organization_id = $1 AND u.role = 'patient' AND u.status = 'active'
       ${qFilter}
       GROUP BY u.id
       ORDER BY u.name ASC`,
      params
    );

    res.json({ success: true, patients: resPats.rows });
  } catch (error) {
    console.error("Reception List Patients Error:", error);
    res.status(500).json({ success: false, message: "Server error loading patients" });
  }
};

exports.registerWalkinPatient = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { name, email, phone, password, doctorId, notes } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Patient name and phone are required" });
    }

    const existingPhone = await findUserByPhone(phone);
    if (existingPhone) {
      return res.status(409).json({ success: false, message: "A user with this phone number already exists" });
    }

    const finalEmail = email && email.trim()
      ? email.trim().toLowerCase()
      : `patient_${phone.replace(/\D/g, "")}_${Date.now()}@medtrack.local`;

    const existingEmail = await findUserByEmail(finalEmail);
    if (existingEmail) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password || "Patient@123", 10);
    const created = await createUser(name.trim(), finalEmail, phone.trim(), hashed, "patient", {
      organizationId: orgId,
      status: "active",
      permissions: getDefaultPermissionsForRole("patient"),
      approvedBy: req.user.id,
      approvedAt: new Date(),
    });

    if (doctorId) {
      await linkPatientToDoctor(doctorId, created.id, {
        organizationId: orgId,
        assignedBy: req.user.id,
        notes: notes || "Assigned at walk-in registration",
      });
    }

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "reception_registered_walkin_patient",
      targetUserId: created.id,
      details: { name: created.name, phone: created.phone, assignedDoctorId: doctorId || null },
    });

    res.status(201).json({
      success: true,
      patient: { id: created.id, name: created.name, email: created.email, phone: created.phone },
    });
  } catch (error) {
    console.error("Walk-in Register Error:", error);
    res.status(500).json({ success: false, message: "Server error registering walk-in patient" });
  }
};

exports.listDoctorPatientMappings = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const resMap = await pool.query(
      `SELECT dp.doctor_id, dp.patient_id, dp.notes, dp.created_at, dp.is_active,
              doc.name AS doctor_name, doc.specialization,
              pat.name AS patient_name, pat.phone AS patient_phone,
              assigner.name AS assigned_by_name
       FROM doctor_patients dp
       JOIN users doc ON dp.doctor_id = doc.id
       JOIN users pat ON dp.patient_id = pat.id
       LEFT JOIN users assigner ON dp.assigned_by = assigner.id
       WHERE dp.organization_id = $1 AND COALESCE(dp.is_active, TRUE) = TRUE
         AND doc.status = 'active' AND pat.status = 'active'
       ORDER BY dp.created_at DESC`,
      [orgId]
    );
    res.json({ success: true, mappings: resMap.rows });
  } catch (error) {
    console.error("List Mappings Error:", error);
    res.status(500).json({ success: false, message: "Server error loading doctor-patient mappings" });
  }
};

exports.assignPatientToDoctor = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { doctorId, patientId, notes = null, exclusive = false } = req.body || {};

    if (!doctorId || !patientId) {
      return res.status(400).json({ success: false, message: "doctorId and patientId are required" });
    }

    const [docRes, patRes] = await Promise.all([
      pool.query(`SELECT id, name FROM users WHERE id = $1 AND organization_id = $2 AND role = 'doctor' AND status = 'active'`, [doctorId, orgId]),
      pool.query(`SELECT id, name FROM users WHERE id = $1 AND organization_id = $2 AND role = 'patient' AND status = 'active'`, [patientId, orgId]),
    ]);

    if (docRes.rows.length === 0) return res.status(404).json({ success: false, message: "Active doctor not found in clinic" });
    if (patRes.rows.length === 0) return res.status(404).json({ success: false, message: "Active patient not found in clinic" });

    if (exclusive) {
      await pool.query(
        `UPDATE doctor_patients SET is_active = FALSE WHERE patient_id = $1 AND organization_id = $2 AND doctor_id != $3`,
        [patientId, orgId, doctorId]
      );
    }

    const mapping = await linkPatientToDoctor(doctorId, patientId, {
      organizationId: orgId,
      assignedBy: req.user.id,
      notes,
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "reception_assigned_patient",
      targetUserId: parseInt(patientId, 10),
      details: { doctorId, doctorName: docRes.rows[0].name, exclusive },
    });

    res.status(201).json({ success: true, mapping });
  } catch (error) {
    console.error("Assign Patient Error:", error);
    res.status(500).json({ success: false, message: "Server error assigning patient to doctor" });
  }
};

exports.unassignPatientFromDoctor = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { doctorId, patientId } = req.params;

    const resUpd = await pool.query(
      `UPDATE doctor_patients SET is_active = FALSE WHERE doctor_id = $1 AND patient_id = $2 AND organization_id = $3 RETURNING *`,
      [doctorId, patientId, orgId]
    );
    if (resUpd.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Doctor-patient mapping not found" });
    }

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "reception_unassigned_patient",
      targetUserId: parseInt(patientId, 10),
      details: { doctorId },
    });

    res.json({ success: true, message: "Patient unassigned from doctor" });
  } catch (error) {
    console.error("Unassign Patient Error:", error);
    res.status(500).json({ success: false, message: "Server error unassigning patient" });
  }
};

const validateAppointmentSlot = async (client, { orgId, doctorId, appointmentDate, slotTime, endTime, excludeAppointmentId = null }) => {
  const startM = timeToMins(slotTime);
  const endM = timeToMins(endTime);
  if (endM <= startM) {
    return { ok: false, status: 400, message: "Invalid slot time range" };
  }

  // Check calendar blocks
  const blockRes = await client.query(
    `SELECT * FROM doctor_calendar_blocks WHERE doctor_id = $1 AND organization_id = $2 AND block_date = $3`,
    [doctorId, orgId, appointmentDate]
  );
  const blocked = blockRes.rows.find((b) =>
    b.is_full_day || intervalsOverlap(startM, endM, timeToMins(b.start_time), timeToMins(b.end_time))
  );
  if (blocked) {
    return { ok: false, status: 409, message: `Doctor's calendar is blocked: ${blocked.reason || "Unavailable"}` };
  }

  // Check double-booking
  const apptRes = await client.query(
    `SELECT * FROM appointments
     WHERE doctor_id = $1 AND organization_id = $2 AND appointment_date = $3
       AND status NOT IN ('cancelled', 'no_show')
       ${excludeAppointmentId ? "AND id != $4" : ""}`,
    excludeAppointmentId ? [doctorId, orgId, appointmentDate, excludeAppointmentId] : [doctorId, orgId, appointmentDate]
  );
  const clash = apptRes.rows.find((a) => intervalsOverlap(startM, endM, timeToMins(a.slot_time), timeToMins(a.end_time)));
  if (clash) {
    return { ok: false, status: 409, message: `Doctor already has an appointment at ${clash.slot_time}` };
  }

  return { ok: true };
};

exports.listAppointments = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { date, doctorId, status } = req.query;

    const conds = ["a.organization_id = $1"];
    const params = [orgId];
    let idx = 2;

    if (date) {
      conds.push(`a.appointment_date = $${idx++}`);
      params.push(date);
    }
    if (doctorId && doctorId !== "all") {
      conds.push(`a.doctor_id = $${idx++}`);
      params.push(doctorId);
    }
    if (status && status !== "all") {
      conds.push(`a.status = $${idx++}`);
      params.push(status);
    }

    const resAppt = await pool.query(
      `SELECT a.*,
              doc.name AS doctor_name, doc.specialization,
              pat.name AS patient_name, pat.phone AS patient_phone
       FROM appointments a
       JOIN users doc ON a.doctor_id = doc.id
       JOIN users pat ON a.patient_id = pat.id
       WHERE ${conds.join(" AND ")}
       ORDER BY a.appointment_date ASC, a.slot_time ASC`,
      params
    );
    res.json({ success: true, appointments: resAppt.rows });
  } catch (error) {
    console.error("List Appointments Error:", error);
    res.status(500).json({ success: false, message: "Server error loading appointments" });
  }
};

exports.createAppointment = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id || 1;
    const {
      doctorId,
      patientId,
      appointmentDate,
      slotTime,
      endTime,
      visitType = "consultation",
      reason = "",
      vitals = {},
    } = req.body || {};

    if (!doctorId || !patientId || !appointmentDate || !slotTime) {
      return res.status(400).json({ success: false, message: "doctorId, patientId, appointmentDate, and slotTime are required" });
    }

    const sched = await getEffectiveScheduleForDay(doctorId, orgId, appointmentDate);
    const finalEndTime = endTime || minsToTime(timeToMins(slotTime) + (sched.slot_duration_mins || 30));

    await client.query("BEGIN");

    const [docRes, patRes] = await Promise.all([
      client.query(`SELECT id, name FROM users WHERE id = $1 AND organization_id = $2 AND role = 'doctor' AND status = 'active'`, [doctorId, orgId]),
      client.query(`SELECT id, name FROM users WHERE id = $1 AND organization_id = $2 AND role = 'patient' AND status = 'active'`, [patientId, orgId]),
    ]);
    if (docRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Active doctor not found in clinic" });
    }
    if (patRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Active patient not found in clinic" });
    }

    const validation = await validateAppointmentSlot(client, {
      orgId,
      doctorId,
      appointmentDate,
      slotTime,
      endTime: finalEndTime,
    });
    if (!validation.ok) {
      await client.query("ROLLBACK");
      return res.status(validation.status).json({ success: false, message: validation.message });
    }

    const initialStatus = visitType === "walk_in" ? "checked_in" : "scheduled";
    const insRes = await client.query(
      `INSERT INTO appointments (
        organization_id, doctor_id, patient_id, appointment_date, slot_time, end_time,
        visit_type, status, reason, vitals, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
      RETURNING *`,
      [orgId, doctorId, patientId, appointmentDate, slotTime, finalEndTime, visitType, initialStatus, reason || null, JSON.stringify(vitals || {}), req.user.id]
    );

    // Ensure patient is assigned/entitled to this doctor automatically
    await client.query(
      `INSERT INTO doctor_patients (doctor_id, patient_id, organization_id, assigned_by, is_active, notes)
       VALUES ($1, $2, $3, $4, TRUE, 'Linked via appointment')
       ON CONFLICT (doctor_id, patient_id) DO UPDATE SET
         is_active = TRUE,
         organization_id = EXCLUDED.organization_id,
         assigned_by = COALESCE(EXCLUDED.assigned_by, doctor_patients.assigned_by)`,
      [doctorId, patientId, orgId, req.user.id]
    );

    await client.query("COMMIT");
    res.status(201).json({ success: true, appointment: insRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create Appointment Error:", error);
    res.status(500).json({ success: false, message: "Server error booking appointment" });
  } finally {
    client.release();
  }
};

exports.updateAppointment = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;
    const { status, appointmentDate, slotTime, endTime, reason, vitals } = req.body || {};

    await client.query("BEGIN");
    const curRes = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, orgId]
    );
    if (curRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }
    const cur = curRes.rows[0];

    const nextDate = appointmentDate || cur.appointment_date.toISOString().split("T")[0];
    const nextSlot = slotTime || cur.slot_time;
    const nextEnd = endTime || (slotTime ? minsToTime(timeToMins(slotTime) + (timeToMins(cur.end_time) - timeToMins(cur.slot_time))) : cur.end_time);

    if (appointmentDate || slotTime || endTime) {
      const validation = await validateAppointmentSlot(client, {
        orgId,
        doctorId: cur.doctor_id,
        appointmentDate: nextDate,
        slotTime: nextSlot,
        endTime: nextEnd,
        excludeAppointmentId: cur.id,
      });
      if (!validation.ok) {
        await client.query("ROLLBACK");
        return res.status(validation.status).json({ success: false, message: validation.message });
      }
    }

    const validStatuses = ["scheduled", "checked_in", "in_consultation", "completed", "cancelled", "no_show"];
    const nextStatus = status || cur.status;
    if (!validStatuses.includes(nextStatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Invalid appointment status" });
    }

    const updRes = await client.query(
      `UPDATE appointments
       SET status = $2,
           appointment_date = $3,
           slot_time = $4,
           end_time = $5,
           reason = COALESCE($6, reason),
           vitals = COALESCE($7::jsonb, vitals),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, nextStatus, nextDate, nextSlot, nextEnd, reason !== undefined ? reason : null, vitals ? JSON.stringify(vitals) : null]
    );

    await client.query("COMMIT");
    res.json({ success: true, appointment: updRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update Appointment Error:", error);
    res.status(500).json({ success: false, message: "Server error updating appointment" });
  } finally {
    client.release();
  }
};

exports.getPatientHistory = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { patientId } = req.params;

    const patRes = await pool.query(
      `SELECT id, name, email, phone, created_at FROM users WHERE id = $1 AND organization_id = $2 AND role = 'patient'`,
      [patientId, orgId]
    );
    if (patRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Patient not found in your clinic" });
    }

    const [apptsRes, mappingsRes, rxRes, checkupsRes] = await Promise.all([
      pool.query(
        `SELECT a.*, doc.name AS doctor_name, doc.specialization
         FROM appointments a
         JOIN users doc ON a.doctor_id = doc.id
         WHERE a.patient_id = $1 AND a.organization_id = $2
         ORDER BY a.appointment_date DESC, a.slot_time DESC`,
        [patientId, orgId]
      ),
      pool.query(
        `SELECT dp.*, doc.name AS doctor_name, doc.specialization
         FROM doctor_patients dp
         JOIN users doc ON dp.doctor_id = doc.id
         WHERE dp.patient_id = $1 AND dp.organization_id = $2
         ORDER BY dp.created_at DESC`,
        [patientId, orgId]
      ),
      pool.query(
        `SELECT p.id AS prescription_id, p.created_at, doc.name AS doctor_name,
                COALESCE(json_agg(json_build_object('medicine_name', m.medicine_name, 'dosage', m.dosage, 'medicine_form', m.medicine_form, 'duration_days', m.duration_days)) FILTER (WHERE m.id IS NOT NULL), '[]') AS medicines
         FROM prescriptions p
         JOIN users doc ON p.doctor_id = doc.id
         LEFT JOIN medicines m ON m.prescription_id = p.id
         WHERE p.patient_id = $1 AND p.organization_id = $2
         GROUP BY p.id, doc.name
         ORDER BY p.created_at DESC`,
        [patientId, orgId]
      ),
      pool.query(
        `SELECT c.*, doc.name AS doctor_name, doc.specialization
         FROM checkups c
         JOIN users doc ON c.doctor_id = doc.id
         WHERE c.patient_id = $1 AND c.organization_id = $2
         ORDER BY c.visit_date DESC, c.created_at DESC`,
        [patientId, orgId]
      ),
    ]);

    res.json({
      success: true,
      patient: patRes.rows[0],
      appointments: apptsRes.rows,
      mappings: mappingsRes.rows,
      prescriptions: rxRes.rows,
      checkups: checkupsRes.rows,
    });
  } catch (error) {
    console.error("Reception Patient History Error:", error);
    res.status(500).json({ success: false, message: "Server error loading patient history" });
  }
};

