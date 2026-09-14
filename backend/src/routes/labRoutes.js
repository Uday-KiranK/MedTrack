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
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("❌ Multer upload error:", err.message);
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  },
  analyzeLabReport
);

module.exports = router;
