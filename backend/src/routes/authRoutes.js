const express = require("express");
const router = express.Router();
const { register, login, verifyOtp, getProtected } = require("../controllers/authController");
const authenticate = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.get("/protected", authenticate, getProtected);

module.exports = router;
