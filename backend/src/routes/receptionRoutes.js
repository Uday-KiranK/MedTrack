const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const { authorizeRole, authorizePermission } = require("../middleware/roleMiddleware");
const receptionController = require("../controllers/receptionController");

router.use(authenticate);
router.use(authorizeRole("receptionist"));

router.get("/doctors", receptionController.listClinicDoctors);
router.get("/doctors/:doctorId/schedule", authorizePermission("manage_schedules", "manage_appointments"), receptionController.getDoctorSchedule);
router.put("/doctors/:doctorId/schedule", authorizePermission("manage_schedules"), receptionController.updateDoctorSchedule);
router.get("/doctors/:doctorId/slots", authorizePermission("manage_appointments", "manage_schedules"), receptionController.getDoctorAvailableSlots);

router.post("/doctors/:doctorId/blocks", authorizePermission("block_doctor_calendar"), receptionController.createCalendarBlock);
router.delete("/blocks/:blockId", authorizePermission("block_doctor_calendar"), receptionController.deleteCalendarBlock);

router.get("/patients", receptionController.listPatients);
router.post("/patients", authorizePermission("register_walkin_patient"), receptionController.registerWalkinPatient);
router.get("/patients/:patientId/history", authorizePermission("view_checkups", "manage_appointments"), receptionController.getPatientHistory);

router.get("/mappings", authorizePermission("assign_doctor_patient", "manage_appointments"), receptionController.listDoctorPatientMappings);
router.post("/mappings", authorizePermission("assign_doctor_patient"), receptionController.assignPatientToDoctor);
router.delete("/mappings/:doctorId/:patientId", authorizePermission("assign_doctor_patient"), receptionController.unassignPatientFromDoctor);

router.get("/appointments", authorizePermission("manage_appointments"), receptionController.listAppointments);
router.post("/appointments", authorizePermission("manage_appointments"), receptionController.createAppointment);
router.patch("/appointments/:id", authorizePermission("manage_appointments"), receptionController.updateAppointment);

module.exports = router;

