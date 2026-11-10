const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const { authorizeRole, authorizePermission } = require("../middleware/roleMiddleware");
const checkupController = require("../controllers/checkupController");

router.use(authenticate);

// Patient views their own checkup history
router.get(
  "/my",
  authorizeRole("patient"),
  authorizePermission("view_own_checkups"),
  checkupController.getMyCheckups
);

// Doctor creates/updates checkup records for assigned patients
router.post(
  "/",
  authorizeRole("doctor"),
  authorizePermission("create_checkups"),
  checkupController.createCheckup
);

router.put(
  "/:id",
  authorizeRole("doctor"),
  authorizePermission("create_checkups"),
  checkupController.updateCheckup
);

// Shared CheckUp History & Follow-ups for assigned Doctor and Clinic Receptionist ONLY
// (Pharmacy Manager is explicitly blocked -> 403)
router.get(
  "/follow-ups",
  authorizeRole("doctor", "receptionist"),
  authorizePermission("view_checkups"),
  checkupController.getUpcomingFollowUps
);

router.get(
  "/patient/:patientId",
  authorizeRole("doctor", "receptionist"),
  authorizePermission("view_checkups"),
  checkupController.getPatientCheckups
);

module.exports = router;

