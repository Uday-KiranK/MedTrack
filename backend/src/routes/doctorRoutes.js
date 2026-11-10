const express = require("express");
const router = express.Router();
const {
  addPatientByPhone,
  getMyPatients,
  getMyAppointments,
  updateMyAppointmentStatus,
  getMyScheduleAndBlocks,
} = require("../controllers/doctorController");
const authenticate = require("../middleware/authMiddleware");
const { authorizeRole, authorizePermission } = require("../middleware/roleMiddleware");

router.use(authenticate);
router.use(authorizeRole("doctor"));

// By default only Receptionists have assign_doctor_patient; solo doctors can be granted it by Admin
router.post("/add-patient", authorizePermission("assign_doctor_patient"), addPatientByPhone);

router.get("/my-patients", authorizePermission("view_assigned_patients"), getMyPatients);
router.get("/appointments", authorizePermission("view_assigned_patients"), getMyAppointments);
router.patch("/appointments/:id/status", authorizePermission("view_assigned_patients"), updateMyAppointmentStatus);
router.get("/schedule", authorizePermission("view_assigned_patients"), getMyScheduleAndBlocks);

module.exports = router;
