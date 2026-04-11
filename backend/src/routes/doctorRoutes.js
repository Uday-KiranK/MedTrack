const express = require("express");
const router = express.Router();
const { addPatientByPhone, getMyPatients } = require("../controllers/doctorController");
const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");

router.post("/add-patient", authenticate, authorizeRole("doctor"), addPatientByPhone);
router.get("/my-patients", authenticate, authorizeRole("doctor"), getMyPatients);

module.exports = router;
