const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createUser, findUserByEmail, findUserByPhone } = require("../models/userModel");

// Mock OTP Store (in real life use Redis or DB with expiry)
const mockOtpStore = {};

// REGISTER
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!["doctor", "patient"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }
    const existingPhone = await findUserByPhone(phone);
    if (existingPhone) {
      return res.status(409).json({ message: "Phone already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await createUser(name, email, phone, hashedPassword, role);

    // Mock sending OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    mockOtpStore[user.phone] = otp;
    
    console.log(`\n========================================`);
    console.log(`📱 SMS TO ${user.phone}: Your MedTrack OTP for Registration is ${otp}`);
    console.log(`========================================\n`);

    res.status(201).json({
      message: "User registered successfully. OTP sent to terminal.",
      requiresOtp: true,
      phone: user.phone
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    // We accept (email AND password) OR (phone)
    const { email, password, phone } = req.body;

    // Flow 1: Phone Login (generates OTP)
    if (phone) {
      const user = await findUserByPhone(phone);
      if (!user) {
        return res.status(401).json({ message: "User not found with this phone number" });
      }

      // Generate OTP
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      mockOtpStore[user.phone] = otp;
      
      console.log(`\n========================================`);
      console.log(`📱 SMS TO ${user.phone}: Your MedTrack OTP for Login is ${otp}`);
      console.log(`========================================\n`);

      return res.json({ 
        message: "OTP sent to terminal",
        requiresOtp: true,
        phone: user.phone
      });
    }

    // Flow 2: Email & Password Login
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password or phone required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ 
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

// VERIFY OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone and OTP required" });
    }

    const storedOtp = mockOtpStore[phone];
    if (!storedOtp || storedOtp !== otp) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    // Clean up OTP to prevent replay
    delete mockOtpStore[phone];

    const user = await findUserByPhone(phone);
    if (!user) {
       return res.status(404).json({ message: "User not found" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ 
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone }
    });
  } catch(error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Server error during OTP verification" });
  }
};

// GET PROTECTED USER
exports.getProtected = async (req, res) => {
  try {
    const pool = require("../utils/db");
    const result = await pool.query("SELECT id, name, email, phone, role FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });
    res.json({ user: result.rows[0] });
  } catch(error) {
    console.error("Protected Route Error:", error);
    res.status(500).json({ message: "Server error loading protected route" });
  }
};
