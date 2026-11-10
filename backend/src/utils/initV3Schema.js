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

    // 3. Extend existing clinic tables with organization_id & pharmacy fields
    await pool.query(`ALTER TABLE clinic_inventory ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;`);
    await pool.query(`UPDATE clinic_inventory SET organization_id = 1 WHERE organization_id IS NULL;`);
    await pool.query(`ALTER TABLE clinic_inventory ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0;`);
    await pool.query(`ALTER TABLE clinic_inventory ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);`);
    await pool.query(`ALTER TABLE clinic_inventory ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2);`);
    await pool.query(`ALTER TABLE clinic_inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

    await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;`);
    await pool.query(`UPDATE prescriptions SET organization_id = 1 WHERE organization_id IS NULL;`);

    await pool.query(`ALTER TABLE doctor_patients ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;`);
    await pool.query(`UPDATE doctor_patients SET organization_id = 1 WHERE organization_id IS NULL;`);
    await pool.query(`ALTER TABLE doctor_patients ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE doctor_patients ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE doctor_patients ADD COLUMN IF NOT EXISTS notes TEXT;`);

    // 3c. Phase 3 Doctor Schedules, Calendar Blocks & Appointments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctor_schedules (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time VARCHAR(10) NOT NULL DEFAULT '09:00',
        end_time VARCHAR(10) NOT NULL DEFAULT '17:00',
        slot_duration_mins INTEGER NOT NULL DEFAULT 30,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (doctor_id, day_of_week)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctor_calendar_blocks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        block_date DATE NOT NULL,
        start_time VARCHAR(10) NOT NULL DEFAULT '00:00',
        end_time VARCHAR(10) NOT NULL DEFAULT '23:59',
        is_full_day BOOLEAN NOT NULL DEFAULT FALSE,
        reason VARCHAR(255),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        appointment_date DATE NOT NULL,
        slot_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        visit_type VARCHAR(32) NOT NULL DEFAULT 'consultation',
        status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
        reason TEXT,
        vitals JSONB DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3b. Phase 2 Pharmacy Stock Movements, Dispense Queue & Invoices
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        inventory_id INTEGER NOT NULL REFERENCES clinic_inventory(id) ON DELETE CASCADE,
        movement_type VARCHAR(32) NOT NULL,
        quantity_change INTEGER NOT NULL,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reference_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pharmacy_orders (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        prescription_id INTEGER UNIQUE NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        dispensed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        dispensed_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pharmacy_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
        medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES clinic_inventory(id) ON DELETE SET NULL,
        medicine_name VARCHAR(255) NOT NULL,
        medicine_form VARCHAR(64),
        dosage VARCHAR(100),
        prescribed_units INTEGER NOT NULL DEFAULT 1,
        reserved_units INTEGER NOT NULL DEFAULT 0,
        dispensed_units INTEGER NOT NULL DEFAULT 0,
        unit_price NUMERIC(10,2) DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'pending'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(64) UNIQUE NOT NULL,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES pharmacy_orders(id) ON DELETE SET NULL,
        prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        payment_status VARCHAR(32) NOT NULL DEFAULT 'unpaid',
        payment_method VARCHAR(32),
        paid_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES clinic_inventory(id) ON DELETE SET NULL,
        medicine_name VARCHAR(255) NOT NULL,
        batch_number VARCHAR(100),
        quantity INTEGER NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
        line_total NUMERIC(10,2) NOT NULL DEFAULT 0
      );
    `);

    // 3d. Phase 4 Shared CheckUp History (Consultations, Vitals, Diagnosis, Follow-Ups)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkups (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
        doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
        visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
        vitals JSONB DEFAULT '{}'::jsonb,
        chief_complaint TEXT,
        diagnosis TEXT,
        clinical_notes TEXT,
        follow_up_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

