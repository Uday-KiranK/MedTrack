const bcrypt = require("bcrypt");
const pool = require("../utils/db");
const { findUserByEmail, findUserByPhone, createUser } = require("../models/userModel");
const {
  VALID_ROLES,
  STAFF_ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  getDefaultPermissionsForRole,
  sanitizePermissions,
} = require("../utils/permissions");
const { logAuditEvent } = require("../utils/auditHelper");

exports.getRolesMetadata = (req, res) => {
  res.json({
    success: true,
    roles: VALID_ROLES,
    staffRoles: STAFF_ROLES,
    permissions: ALL_PERMISSIONS,
    defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
  });
};

exports.getOverview = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;

    const [
      userStatsRes,
      rxStatsRes,
      medBreakdownRes,
      invStatsRes,
      intakeStatsRes,
      recentAuditRes,
    ] = await Promise.all([
      pool.query(
        `SELECT role, status, COUNT(*)::int AS count
         FROM users
         WHERE organization_id = $1 AND status != 'removed'
         GROUP BY role, status`,
        [orgId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_prescriptions,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS rx_last_7_days
         FROM prescriptions
         WHERE organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_medicines_prescribed,
           COUNT(*) FILTER (WHERE m.availability_source = 'clinic_pharmacy')::int AS clinic_pharmacy_count,
           COUNT(*) FILTER (WHERE m.availability_source = 'buy_outside')::int AS buy_outside_count
         FROM medicines m
         JOIN prescriptions p ON m.prescription_id = p.id
         WHERE p.organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_skus,
           COALESCE(SUM(stock_quantity), 0)::int AS total_units,
           COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(reorder_level, 10))::int AS low_stock_count,
           COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days')::int AS expiring_soon_count
         FROM clinic_inventory
         WHERE organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS intakes_last_7_days
         FROM medicine_intakes mi
         JOIN users u ON mi.patient_id = u.id
         WHERE u.organization_id = $1 AND mi.taken_at >= NOW() - INTERVAL '7 days'`,
        [orgId]
      ),
      pool.query(
        `SELECT al.id, al.action, al.details, al.created_at,
                actor.name AS actor_name, actor.role AS actor_role,
                target.name AS target_name, target.role AS target_role
         FROM audit_logs al
         LEFT JOIN users actor ON al.actor_id = actor.id
         LEFT JOIN users target ON al.target_user_id = target.id
         WHERE al.organization_id = $1
         ORDER BY al.created_at DESC
         LIMIT 10`,
        [orgId]
      ),
    ]);

    const summary = {
      activeDoctors: 0,
      activeReceptionists: 0,
      activePharmacyManagers: 0,
      activeAdmins: 0,
      activePatients: 0,
      pendingApprovals: 0,
      suspendedUsers: 0,
    };

    for (const row of userStatsRes.rows) {
      if (row.status === "pending_approval") {
        summary.pendingApprovals += row.count;
      } else if (row.status === "suspended") {
        summary.suspendedUsers += row.count;
      } else if (row.status === "active") {
        if (row.role === "doctor") summary.activeDoctors += row.count;
        else if (row.role === "receptionist") summary.activeReceptionists += row.count;
        else if (row.role === "pharmacy_manager") summary.activePharmacyManagers += row.count;
        else if (row.role === "admin") summary.activeAdmins += row.count;
        else if (row.role === "patient") summary.activePatients += row.count;
      }
    }

    res.json({
      success: true,
      overview: {
        users: summary,
        prescriptions: rxStatsRes.rows[0] || { total_prescriptions: 0, rx_last_7_days: 0 },
        medicines: medBreakdownRes.rows[0] || { total_medicines_prescribed: 0, clinic_pharmacy_count: 0, buy_outside_count: 0 },
        inventory: invStatsRes.rows[0] || { total_skus: 0, total_units: 0, low_stock_count: 0, expiring_soon_count: 0 },
        adherence: intakeStatsRes.rows[0] || { intakes_last_7_days: 0 },
        recentAuditLogs: recentAuditRes.rows,
      },
    });
  } catch (error) {
    console.error("Admin Overview Error:", error);
    res.status(500).json({ success: false, message: "Server error loading admin overview" });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { role, status, q } = req.query;

    const conditions = ["organization_id = $1"];
    const params = [orgId];
    let idx = 2;

    if (role && role !== "all") {
      conditions.push(`role = $${idx++}`);
      params.push(role);
    }

    if (status && status !== "all") {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    } else {
      conditions.push(`status != 'removed'`);
    }

    if (q && q.trim()) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx} OR COALESCE(specialization, '') ILIKE $${idx})`);
      params.push(`%${q.trim()}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT id, name, email, phone, role, status, organization_id, is_superadmin, permissions, specialization, approved_by, approved_at, created_at
       FROM users
       WHERE ${conditions.join(" AND ")}
       ORDER BY CASE WHEN status = 'pending_approval' THEN 0 ELSE 1 END, created_at DESC`,
      params
    );

    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error("Admin List Users Error:", error);
    res.status(500).json({ success: false, message: "Server error listing users" });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const result = await pool.query(
      `SELECT id, name, email, phone, role, status, specialization, permissions, created_at
       FROM users
       WHERE organization_id = $1 AND status = 'pending_approval'
       ORDER BY created_at ASC`,
      [orgId]
    );
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    console.error("Pending Approvals Error:", error);
    res.status(500).json({ success: false, message: "Server error loading pending approvals" });
  }
};

exports.createStaffUser = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { name, email, phone, password, role, permissions, specialization } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({ success: false, message: "Name, email, phone, password, and role are required" });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role specified" });
    }

    if (role === "admin" && !req.user.is_superadmin) {
      return res.status(403).json({ success: false, message: "Only a Superadmin can create another Admin account" });
    }

    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ success: false, message: "Email is already registered" });
    }

    const existingPhone = await findUserByPhone(phone);
    if (existingPhone) {
      return res.status(409).json({ success: false, message: "Phone number is already registered" });
    }

    const resolvedPerms = Array.isArray(permissions)
      ? sanitizePermissions(permissions)
      : getDefaultPermissionsForRole(role);

    const hashed = await bcrypt.hash(password, 10);
    const created = await createUser(name.trim(), email.trim().toLowerCase(), phone.trim(), hashed, role, {
      organizationId: orgId,
      status: "active",
      isSuperadmin: false,
      permissions: resolvedPerms,
      specialization: role === "doctor" ? (specialization || null) : null,
      approvedBy: req.user.id,
      approvedAt: new Date(),
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "admin_created_user",
      targetUserId: created.id,
      details: { role, name: created.name, email: created.email, permissions: resolvedPerms },
    });

    res.status(201).json({
      success: true,
      message: `${role} account created and activated`,
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        phone: created.phone,
        role: created.role,
        status: created.status,
        organization_id: created.organization_id,
        permissions: created.permissions,
        specialization: created.specialization,
      },
    });
  } catch (error) {
    console.error("Create Staff User Error:", error);
    res.status(500).json({ success: false, message: "Server error creating user" });
  }
};

exports.approveStaffUser = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;
    const { role, permissions, specialization } = req.body || {};

    const targetRes = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found in your organization" });
    }
    const target = targetRes.rows[0];

    const finalRole = role && VALID_ROLES.includes(role) ? role : target.role;
    if (finalRole === "admin" && !req.user.is_superadmin) {
      return res.status(403).json({ success: false, message: "Only a Superadmin can approve into Admin role" });
    }

    const finalPerms = Array.isArray(permissions)
      ? sanitizePermissions(permissions)
      : (role && role !== target.role ? getDefaultPermissionsForRole(finalRole) : (Array.isArray(target.permissions) && target.permissions.length > 0 ? target.permissions : getDefaultPermissionsForRole(finalRole)));

    const finalSpec = specialization !== undefined ? specialization : target.specialization;

    const updated = await pool.query(
      `UPDATE users
       SET status = 'active',
           role = $2,
           permissions = $3::jsonb,
           specialization = $4,
           approved_by = $5,
           approved_at = NOW()
       WHERE id = $1 AND organization_id = $6
       RETURNING id, name, email, phone, role, status, organization_id, is_superadmin, permissions, specialization, approved_by, approved_at`,
      [id, finalRole, JSON.stringify(finalPerms), finalSpec, req.user.id, orgId]
    );

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "admin_approved_user",
      targetUserId: parseInt(id, 10),
      details: { role: finalRole, permissions: finalPerms },
    });

    res.json({ success: true, message: "User approved and activated", user: updated.rows[0] });
  } catch (error) {
    console.error("Approve User Error:", error);
    res.status(500).json({ success: false, message: "Server error approving user" });
  }
};

exports.updateStaffUser = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;
    const { role, permissions, status, name, phone, specialization } = req.body || {};

    const targetRes = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found in your organization" });
    }
    const target = targetRes.rows[0];

    if (parseInt(id, 10) === req.user.id && (status === "suspended" || status === "removed" || (role && role !== req.user.role))) {
      return res.status(400).json({ success: false, message: "You cannot suspend, remove, or demote yourself" });
    }

    if (target.is_superadmin && !req.user.is_superadmin) {
      return res.status(403).json({ success: false, message: "Only a Superadmin can modify another Superadmin" });
    }

    const nextRole = role !== undefined ? role : target.role;
    if (!VALID_ROLES.includes(nextRole)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    if (nextRole === "admin" && target.role !== "admin" && !req.user.is_superadmin) {
      return res.status(403).json({ success: false, message: "Only a Superadmin can promote to Admin" });
    }

    const allowedStatuses = ["active", "suspended", "pending_approval", "removed"];
    const nextStatus = status !== undefined ? status : target.status;
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    let nextPerms = target.permissions;
    if (Array.isArray(permissions)) {
      nextPerms = sanitizePermissions(permissions);
    } else if (role !== undefined && role !== target.role) {
      nextPerms = getDefaultPermissionsForRole(nextRole);
    }

    const updated = await pool.query(
      `UPDATE users
       SET role = $2,
           permissions = $3::jsonb,
           status = $4,
           name = COALESCE($5, name),
           phone = COALESCE($6, phone),
           specialization = $7
       WHERE id = $1 AND organization_id = $8
       RETURNING id, name, email, phone, role, status, organization_id, is_superadmin, permissions, specialization, approved_by, approved_at`,
      [
        id,
        nextRole,
        JSON.stringify(nextPerms || []),
        nextStatus,
        name || null,
        phone || null,
        specialization !== undefined ? specialization : target.specialization,
        orgId,
      ]
    );

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "admin_updated_user",
      targetUserId: parseInt(id, 10),
      details: { role: nextRole, status: nextStatus, permissions: nextPerms },
    });

    res.json({ success: true, user: updated.rows[0] });
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ success: false, message: "Server error updating user" });
  }
};

exports.removeStaffUser = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;

    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ success: false, message: "You cannot remove your own account" });
    }

    const targetRes = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found in your organization" });
    }
    const target = targetRes.rows[0];

    if (target.is_superadmin) {
      return res.status(403).json({ success: false, message: "Superadmin account cannot be removed" });
    }

    if (target.role === "admin" && !req.user.is_superadmin) {
      return res.status(403).json({ success: false, message: "Only a Superadmin can remove another Admin" });
    }

    await pool.query(
      `UPDATE users SET status = 'removed' WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "admin_removed_user",
      targetUserId: parseInt(id, 10),
      details: { name: target.name, email: target.email, previousRole: target.role },
    });

    res.json({ success: true, message: "User removed from organization (medical records preserved)" });
  } catch (error) {
    console.error("Remove User Error:", error);
    res.status(500).json({ success: false, message: "Server error removing user" });
  }
};

exports.getOrganization = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const result = await pool.query(`SELECT * FROM organizations WHERE id = $1`, [orgId]);
    res.json({ success: true, organization: result.rows[0] || null });
  } catch (error) {
    console.error("Get Org Error:", error);
    res.status(500).json({ success: false, message: "Server error loading organization" });
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { name, code, address, phone } = req.body || {};

    const result = await pool.query(
      `UPDATE organizations
       SET name = COALESCE($2, name),
           code = COALESCE($3, code),
           address = COALESCE($4, address),
           phone = COALESCE($5, phone)
       WHERE id = $1
       RETURNING *`,
      [orgId, name || null, code ? code.trim().toUpperCase() : null, address || null, phone || null]
    );

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user.id,
      action: "admin_updated_organization",
      details: { name, code },
    });

    res.json({ success: true, organization: result.rows[0] });
  } catch (error) {
    console.error("Update Org Error:", error);
    res.status(500).json({ success: false, message: "Server error updating organization" });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const result = await pool.query(
      `SELECT al.id, al.action, al.details, al.created_at,
              actor.name AS actor_name, actor.role AS actor_role,
              target.name AS target_name, target.role AS target_role
       FROM audit_logs al
       LEFT JOIN users actor ON al.actor_id = actor.id
       LEFT JOIN users target ON al.target_user_id = target.id
       WHERE al.organization_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [orgId]
    );
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    console.error("Audit Logs Error:", error);
    res.status(500).json({ success: false, message: "Server error loading audit logs" });
  }
};

