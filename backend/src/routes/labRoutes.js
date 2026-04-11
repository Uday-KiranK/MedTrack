const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const upload = require("../utils/labUpload");
const { analyzeLabReport } = require("../controllers/labController");

router.post(
  "/upload",
  authenticate,
  authorizeRole("patient"),
  upload.single("file"),
  analyzeLabReport
);

module.exports = router;
