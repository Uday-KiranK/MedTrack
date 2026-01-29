const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const upload = require("../utils/labUpload");
const { uploadLabReport } = require("../controllers/labController");

router.post(
  "/upload",
  authenticate,
  authorizeRole("patient"),
  upload.single("file"),
  uploadLabReport
);

module.exports = router;
