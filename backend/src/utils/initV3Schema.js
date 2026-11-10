const bcrypt = require("bcrypt");
const pool = require("./db");
const { DEFAULT_ROLE_PERMISSIONS } = require("./permissions");

let initializedPromise = null;

async function runInitV3Schema() {
  try {
    // 1. Organizations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64) UNIQUE NOT NULL,
        address TEXT,
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      INSERT INTO organizations (id, name, code, address, phone)
      VALUES (1, 'MedTrack Main Clinic', 'MEDTRACK01', 'Main Campus', '9000000000')
      ON CONFLICT (id) DO NOTHING;
    `);
    await pool.query(`
      SELECT setval(pg_get_serial_sequence('organizations', 'id'), COALESCE((SELECT MAX(id) FROM organizations), 1));
    `);

    // 2. Extend users table for multi-role RBAC, org scoping, approvals, and specialization
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(128);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;`);

    // Backfill existing users into default org & default role permissions
    await pool.query(`UPDATE users SET organization_id = 1 WHERE organization_id IS NULL;`);
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      await pool.query(
        `UPDATE users SET permissions = $1::jsonb WHERE role = $2 AND (permissions IS NULL OR jsonb_array_length(permissions) = 0)`,
        [JSON.stringify(perms), role]
      );
    }

    // 3. Extend existing clinic tables with organization_id (prep for Phase 2 & 3)
    await pool.query(`ALTER TABLE clinic_inventory ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;`);
    await pool.query(`UPDATE clinic_inventory SET organization_id = 1 WHERE organization_id IS NULL;`);
    await pool.query(`ALTER TABLE clinic_inventory ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0;`);

    await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;`);
    await pool.query(`UPDATE prescriptions SET organization_id = 1 WHERE organization_id IS NULL;`);

    await pool.query(`ALTER TABLE doctor_patients ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;`);
    await pool.query(`UPDATE doctor_patients SET organization_id = 1 WHERE organization_id IS NULL;`);

    // 4. Audit logs table for Admin & compliance tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Seed initial Superadmin if no admin exists
    const adminCheck = await pool.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (adminCheck.rows.length === 0) {
      const superEmail = (process.env.SUPERADMIN_EMAIL || "admin@medtrack.app").trim().toLowerCase();
      const superPhone = (process.env.SUPERADMIN_PHONE || "9000000000").trim();
      const superPass = process.env.SUPERADMIN_PASSWORD || "Admin@123";
      const hashed = await bcrypt.hash(superPass, 10);
      const adminPerms = JSON.stringify(DEFAULT_ROLE_PERMISSIONS.admin);

      await pool.query(
        `INSERT INTO users (name, email, phone, password, role, organization_id, status, is_superadmin, permissions)
         VALUES ($1, $2, $3, $4, 'admin', 1, 'active', TRUE, $5::jsonb)
         ON CONFLICT (email) DO NOTHING`,
        ["Super Admin", superEmail, superPhone, hashed, adminPerms]
      );
      console.log(`✓ Seeded default Superadmin: ${superEmail} (Org: MEDTRACK01)`);
    }

    console.log("✓ V3 schema & RBAC foundation initialized");
  } catch (err) {
    console.error("V3 Schema init error:", err.message);
    throw err;
  }
}

function initV3Schema() {
  if (!initializedPromise) {
    initializedPromise = runInitV3Schema().catch((err) => {
      initializedPromise = null;
      throw err;
    });
  }
  return initializedPromise;
}

module.exports = { initV3Schema };

