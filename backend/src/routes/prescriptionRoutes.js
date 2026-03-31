const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");

const {
  createPrescription,
  getMyMedicines,
  getDoctorPrescriptions   // 👈 add this
} = require("../controllers/prescriptionController");

router.post("/", authenticate, authorizeRole("doctor"), createPrescription);

router.get("/my", authenticate, authorizeRole("patient"), getMyMedicines);

// 👇 NEW ROUTE
router.get("/doctor", authenticate, authorizeRole("doctor"), getDoctorPrescriptions);

module.exports = router;
