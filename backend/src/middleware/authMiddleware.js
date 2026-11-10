const jwt = require("jsonwebtoken");
const pool = require("../utils/db");

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch live user state so approvals, suspensions, role changes, and feature toggles take effect immediately
    const result = await pool.query(
      `SELECT id, name, email, phone, role, status, organization_id, is_superadmin, permissions, specialization
       FROM users
       WHERE id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "User account no longer exists" });
    }

    const user = result.rows[0];
    if (user.status === "pending_approval") {
      return res.status(403).json({
        pendingApproval: true,
        message: "Your staff account is pending Admin approval."
      });
    }
    if (user.status && user.status !== "active") {
      return res.status(403).json({
        message: "Account is suspended or removed. Please contact your Clinic Admin."
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      organization_id: user.organization_id || 1,
      is_superadmin: !!user.is_superadmin,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      specialization: user.specialization || null
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authenticate;
