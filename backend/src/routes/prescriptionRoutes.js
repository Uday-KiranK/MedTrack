const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");

const {
  createPrescription,
  getMyMedicines,
} = require("../controllers/prescriptionController");

router.post("/", authenticate, authorizeRole("doctor"), createPrescription);
router.get("/my", authenticate, authorizeRole("patient"), getMyMedicines);

module.exports = router;
