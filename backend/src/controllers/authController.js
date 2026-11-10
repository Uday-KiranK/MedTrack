const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createUser, findUserByEmail, findUserByPhone, findOrganizationByCode } = require("../models/userModel");
const { sendOtpSms } = require("../utils/smsHelper");
const { SELF_REGISTER_ROLES, getDefaultPermissionsForRole } = require("../utils/permissions");
const { logAuditEvent } = require("../utils/auditHelper");

// Mock OTP Store
const mockOtpStore = {};

const normalizePhoneKey = (phone) => {
  if (!phone) return '';
  const digits = phone.toString().replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

const formatAuthUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  status: user.status || 'active',
  organization_id: user.organization_id || 1,
  is_superadmin: !!user.is_superadmin,
  permissions: Array.isArray(user.permissions) && user.permissions.length > 0
    ? user.permissions
    : getDefaultPermissionsForRole(user.role),
  specialization: user.specialization || null,
  phone: user.phone,
  breakfast_time: user.breakfast_time || '08:00',
  lunch_time: user.lunch_time || '13:30',
  dinner_time: user.dinner_time || '20:30',
  bedtime: user.bedtime || '22:00',
  ringtone_uri: user.ringtone_uri || 'default',
  routine_configured: user.routine_configured || false
});

const checkAccountStatus = (user, res) => {
  if (user.status === "pending_approval") {
    res.status(403).json({
      pendingApproval: true,
      message: "Your staff account is pending Admin approval. Please wait for your Clinic Admin to approve your access."
    });
    return false;
  }
  if (user.status && user.status !== "active") {
    res.status(403).json({
      message: "Your account is suspended or removed. Please contact your Clinic Admin."
    });
    return false;
  }
  return true;
};

// REGISTER
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role, organizationCode, specialization } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!SELF_REGISTER_ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role for self-registration" });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }
    const existingPhone = await findUserByPhone(phone);
    if (existingPhone) {
      return res.status(409).json({ message: "Phone already registered" });
    }

    let organizationId = 1;
    if (organizationCode && organizationCode.trim()) {
      const org = await findOrganizationByCode(organizationCode);
      if (!org) {
        return res.status(404).json({ message: "Invalid clinic/organization code" });
      }
      organizationId = org.id;
    }

    const isStaff = role !== "patient";
    const status = isStaff ? "pending_approval" : "active";
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await createUser(name, email, phone, hashedPassword, role, {
      organizationId,
      status,
      permissions: getDefaultPermissionsForRole(role),
      specialization: role === "doctor" ? (specialization || null) : null
    });

    if (isStaff) {
      await logAuditEvent({
        organizationId,
        actorId: user.id,
        action: "staff_registration_requested",
        targetUserId: user.id,
        details: { role, name, email }
      });
    }

    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const phoneKey = normalizePhoneKey(user.phone);
    mockOtpStore[phoneKey] = otp;
    mockOtpStore[user.phone] = otp;

    // Send SMS non-blocking in background for instant response
    sendOtpSms(user.phone, otp, "Registration").catch(err => {
      console.error("Async SMS dispatch error:", err.message);
    });

    res.status(201).json({
      message: isStaff
        ? "Staff registration submitted. Verify OTP, then wait for Clinic Admin approval."
        : "User registered successfully. OTP sent.",
      requiresOtp: true,
      pendingApproval: isStaff,
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

      if (!checkAccountStatus(user, res)) return;

      // Generate OTP
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const phoneKey = normalizePhoneKey(user.phone);
      mockOtpStore[phoneKey] = otp;
      mockOtpStore[user.phone] = otp;

      // Send SMS non-blocking in background for instant response
      sendOtpSms(user.phone, otp, "Login").catch(err => {
        console.error("Async SMS dispatch error:", err.message);
      });

      return res.json({ 
        message: "OTP sent.",
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

    if (!checkAccountStatus(user, res)) return;

    const token = jwt.sign(
      { id: user.id, role: user.role, organization_id: user.organization_id || 1 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ 
      token,
      user: formatAuthUser(user)
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

    const key = normalizePhoneKey(phone);
    const storedOtp = mockOtpStore[key] || mockOtpStore[phone];

    // Accept generated OTP or universal master test OTP '1234'
    const isValid = otp === '1234' || (storedOtp && storedOtp === otp);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    // Clean up OTP to prevent replay
    if (key) delete mockOtpStore[key];
    if (phone) delete mockOtpStore[phone];

    const user = await findUserByPhone(phone);
    if (!user) {
       return res.status(404).json({ message: "User not found" });
    }

    if (user.status === "pending_approval") {
      return res.json({
        verified: true,
        pendingApproval: true,
        message: "Phone verified! Your staff account is pending approval by your Clinic Admin."
      });
    }

    if (!checkAccountStatus(user, res)) return;

    const token = jwt.sign(
      { id: user.id, role: user.role, organization_id: user.organization_id || 1 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ 
      token,
      user: formatAuthUser(user)
    });
  } catch(error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Server error during OTP verification" });
  }
};

// GET PROTECTED USER
exports.getProtected = async (req, res) => {
  try {
    const { findUserById } = require("../models/userModel");
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: formatAuthUser(user) });
  } catch(error) {
    console.error("Protected Route Error:", error);
    res.status(500).json({ message: "Server error loading protected route" });
  }
};

// UPDATE PROFILE & ROUTINE
exports.updateProfile = async (req, res) => {
  try {
    const { updateUserProfile } = require("../models/userModel");
    const updatedUser = await updateUserProfile(req.user.id, req.body);
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error updating profile" });
  }
};
