const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");

const {
  createPrescription,
  getMyMedicines,
  getDoctorPrescriptions,
  editMedicine,
  getMedicinesForDoctorPatient
} = require("../controllers/prescriptionController");

router.post("/", authenticate, authorizeRole("doctor"), createPrescription);

router.get("/my", authenticate, authorizeRole("patient"), getMyMedicines);

router.get("/doctor", authenticate, authorizeRole("doctor"), getDoctorPrescriptions);
router.get("/doctor/patient/:patientId", authenticate, authorizeRole("doctor"), getMedicinesForDoctorPatient);
router.put("/medicine/:id", authenticate, authorizeRole("doctor"), editMedicine);

module.exports = router;
