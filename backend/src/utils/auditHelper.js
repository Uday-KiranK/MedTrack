const pool = require("./db");

async function logAuditEvent({ organizationId, actorId, action, targetUserId = null, details = {} }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (organization_id, actor_id, action, target_user_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [organizationId || 1, actorId || null, action, targetUserId || null, JSON.stringify(details || {})]
    );
  } catch (err) {
    console.warn("Audit log write skipped:", err.message);
  }
}

module.exports = { logAuditEvent };

