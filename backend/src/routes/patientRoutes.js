const express = require("express");
const router = express.Router();
const pool = require("../utils/db");
const authenticate = require("../middleware/authMiddleware");
const { authorizeRole, authorizePermission } = require("../middleware/roleMiddleware");

router.use(authenticate);
router.use(authorizeRole("patient"));

router.get(
  "/appointments",
  authorizePermission("view_own_appointments"),
  async (req, res) => {
    try {
      const patientId = req.user.id;
      const orgId = req.user.organization_id || 1;
      const appts = await pool.query(
        `SELECT a.*, doc.name AS doctor_name, doc.specialization
         FROM appointments a
         JOIN users doc ON a.doctor_id = doc.id
         WHERE a.patient_id = $1 AND a.organization_id = $2
         ORDER BY a.appointment_date DESC, a.slot_time DESC`,
        [patientId, orgId]
      );
      res.json({ success: true, appointments: appts.rows });
    } catch (error) {
      console.error("Patient Appointments Error:", error);
      res.status(500).json({ success: false, message: "Server error loading appointments" });
    }
  }
);

module.exports = router;

