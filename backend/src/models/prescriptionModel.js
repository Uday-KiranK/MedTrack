const pool = require("../utils/db");
const { computePrescribedUnits, findBestInventoryMatch, recordMovement } = require("./inventoryModel");

const createPrescription = async (doctorId, patientId, startDate = null, organizationId = 1) => {
  const res = await pool.query(
    "INSERT INTO prescriptions (doctor_id, patient_id, organization_id, created_at) VALUES ($1,$2,$3, COALESCE($4, NOW())) RETURNING *",
    [doctorId, patientId, organizationId, startDate]
  );
  return res.rows[0];
};

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
    availability_source = 'buy_outside',
    medicine_form = 'Tablet',
    meal_slots = [],
    custom_schedule_text = null,
    custom_duration_text = null
  } = data;

  const res = await pool.query(
    `INSERT INTO medicines (
      prescription_id, medicine_name, dosage, schedule_type,
      frequency_per_day, duration_days, time_slots,
      custom_times, interval_days, selected_days,
      food_instruction, instructions, availability_source,
      medicine_form, meal_slots, custom_schedule_text, custom_duration_text
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
      availability_source,
      medicine_form,
      meal_slots,
      custom_schedule_text,
      custom_duration_text
    ]
  );

  return res.rows[0];
};

// Automatically queues clinic_pharmacy items to the Pharmacy Manager & reserves available un-expired stock
const createPharmacyOrderForPrescription = async ({ organizationId = 1, prescriptionId, doctorId, patientId, insertedMedicines }) => {
  const clinicMeds = (insertedMedicines || []).filter((m) => m.availability_source === "clinic_pharmacy");
  if (clinicMeds.length === 0) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderRes = await client.query(
      `INSERT INTO pharmacy_orders (organization_id, prescription_id, patient_id, doctor_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [organizationId, prescriptionId, patientId, doctorId]
    );
    const order = orderRes.rows[0];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = [];
    for (const med of clinicMeds) {
      const invItem = await findBestInventoryMatch(client, organizationId, med.medicine_name);
      const prescribedUnits = computePrescribedUnits(med, invItem);

      let reservedUnits = 0;
      let itemStatus = "pending";
      const unitPrice = invItem && invItem.selling_price !== null ? parseFloat(invItem.selling_price) : 0;

      if (invItem) {
        const isExpired = invItem.expiry_date && new Date(invItem.expiry_date) < today;
        const available = Math.max(0, (invItem.stock_quantity || 0) - (invItem.reserved_quantity || 0));
        if (!isExpired && available > 0) {
          reservedUnits = Math.min(prescribedUnits, available);
          await client.query(
            `UPDATE clinic_inventory SET reserved_quantity = COALESCE(reserved_quantity, 0) + $2, updated_at = NOW() WHERE id = $1`,
            [invItem.id, reservedUnits]
          );
          await recordMovement(client, {
            organizationId,
            inventoryId: invItem.id,
            movementType: "reserve",
            quantityChange: reservedUnits,
            actorId: doctorId,
            referenceId: order.id,
            notes: `Reserved ${reservedUnits} unit(s) for Rx #${prescriptionId}`,
          });
        } else {
          itemStatus = isExpired || available === 0 ? "unavailable" : "pending";
        }
      } else {
        itemStatus = "unavailable";
      }

      const itemRes = await client.query(
        `INSERT INTO pharmacy_order_items (
          order_id, medicine_id, inventory_id, medicine_name, medicine_form, dosage,
          prescribed_units, reserved_units, dispensed_units, unit_price, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10)
        RETURNING *`,
        [
          order.id,
          med.id,
          invItem ? invItem.id : null,
          med.medicine_name,
          med.medicine_form || "Tablet",
          med.dosage || "",
          prescribedUnits,
          reservedUnits,
          unitPrice,
          itemStatus,
        ]
      );
      items.push(itemRes.rows[0]);
    }

    await client.query("COMMIT");
    return { ...order, items };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create pharmacy order error:", err.message);
    return null;
  } finally {
    client.release();
  }
};

const getMedicinesForPatient = async (patientId) => {
  const res = await pool.query(
    `
    SELECT m.*, p.patient_id, d.name AS doctor_name, p.created_at AS start_date,
           po.status AS pharmacy_order_status, po.id AS pharmacy_order_id,
           u.breakfast_time, u.lunch_time, u.dinner_time, u.bedtime, u.ringtone_uri,
           COALESCE(json_agg(i.taken_at ORDER BY i.taken_at DESC) FILTER (WHERE i.taken_at IS NOT NULL), '[]') AS intakes
    FROM medicines m
    JOIN prescriptions p ON p.id = m.prescription_id
    JOIN users d ON p.doctor_id = d.id
    JOIN users u ON p.patient_id = u.id
    LEFT JOIN pharmacy_orders po ON po.prescription_id = p.id
    LEFT JOIN medicine_intakes i ON i.medicine_id = m.id
    WHERE p.patient_id = $1
    GROUP BY m.id, p.patient_id, d.name, p.created_at, po.status, po.id, u.breakfast_time, u.lunch_time, u.dinner_time, u.bedtime, u.ringtone_uri
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
  createPharmacyOrderForPrescription,
  getMedicinesForPatient,
  editMedicine,
  getDoctorPatientPrescriptions,
  recordIntake
};

