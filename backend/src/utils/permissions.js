const VALID_ROLES = [
  "patient",
  "doctor",
  "pharmacy_manager",
  "receptionist",
  "admin",
];

const STAFF_ROLES = ["doctor", "pharmacy_manager", "receptionist", "admin"];
const SELF_REGISTER_ROLES = ["patient", "doctor", "pharmacy_manager", "receptionist"];

const ALL_PERMISSIONS = [
  // Admin permissions
  { key: "manage_staff", label: "Manage Staff", group: "Admin", description: "Add, edit, suspend, or remove clinic staff" },
  { key: "approve_staff", label: "Approve Registrations", group: "Admin", description: "Approve or reject pending staff signups" },
  { key: "assign_roles", label: "Assign Roles & Features", group: "Admin", description: "Change staff roles and feature permissions" },
  { key: "view_org_analytics", label: "Organization Analytics", group: "Admin", description: "View clinic-wide operational statistics" },
  { key: "view_audit_logs", label: "Audit Logs", group: "Admin", description: "Inspect security and administrative audit trail" },
  { key: "manage_organization", label: "Clinic Settings", group: "Admin", description: "Update clinic profile and invite code" },

  // Doctor permissions
  { key: "create_prescriptions", label: "Create Prescriptions", group: "Doctor", description: "Prescribe medicines to assigned patients" },
  { key: "view_assigned_patients", label: "View Assigned Patients", group: "Doctor", description: "View patients linked/assigned to this doctor" },
  { key: "create_checkups", label: "Record CheckUps", group: "Doctor", description: "Create clinical consultation notes and vitals" },
  { key: "view_checkups", label: "View CheckUp History", group: "Clinical", description: "View patient checkup visit history" },
  { key: "view_patient_labs", label: "View Patient Lab Reports", group: "Doctor", description: "Review lab reports for assigned patients" },
  { key: "view_clinic_stock_readonly", label: "View Clinic Stock (Read-Only)", group: "Doctor", description: "Check clinic pharmacy availability while prescribing" },

  // Pharmacy Manager permissions
  { key: "manage_inventory", label: "Manage Pharmacy Stock", group: "Pharmacy", description: "Add, edit, restock, and remove pharmacy inventory" },
  { key: "dispense_prescriptions", label: "Dispense Prescriptions", group: "Pharmacy", description: "Fulfill incoming doctor prescriptions from stock" },
  { key: "generate_invoices", label: "Generate Pharmacy Invoices", group: "Pharmacy", description: "Create and mark medicine bills/invoices as paid" },
  { key: "view_pharmacy_analytics", label: "Pharmacy Analytics", group: "Pharmacy", description: "Track low-stock alerts, expiries, and dispense volume" },

  // Receptionist permissions
  { key: "manage_schedules", label: "Manage Doctor Schedules", group: "Reception", description: "Configure and view clinic doctors' schedules" },
  { key: "block_doctor_calendar", label: "Block Doctor Calendar", group: "Reception", description: "Block/unblock doctor availability slots" },
  { key: "manage_appointments", label: "Manage Appointments", group: "Reception", description: "Book, check in, reschedule, or cancel appointments" },
  { key: "assign_doctor_patient", label: "Assign Patients to Doctors", group: "Reception", description: "Create or update doctor-patient assignments" },
  { key: "register_walkin_patient", label: "Walk-in Patient Registration", group: "Reception", description: "Register new patients at the front desk" },

  // Patient permissions
  { key: "view_own_prescriptions", label: "View Own Prescriptions", group: "Patient", description: "Access personal medicines and alarms" },
  { key: "record_intake", label: "Record Medicine Intake", group: "Patient", description: "Log taken doses for adherence streak" },
  { key: "upload_labs", label: "Upload Lab Reports", group: "Patient", description: "Upload PDF/image lab reports for AI analysis" },
  { key: "view_own_checkups", label: "View Own CheckUps", group: "Patient", description: "View personal clinical checkup history" },
  { key: "view_own_appointments", label: "View Own Appointments", group: "Patient", description: "View scheduled clinic visits" },
  { key: "view_own_invoices", label: "View Own Invoices", group: "Patient", description: "View pharmacy bills and payment status" },
];

const VALID_PERMISSION_KEYS = new Set(ALL_PERMISSIONS.map((p) => p.key));

const DEFAULT_ROLE_PERMISSIONS = {
  admin: [
    "manage_staff",
    "approve_staff",
    "assign_roles",
    "view_org_analytics",
    "view_audit_logs",
    "manage_organization",
  ],
  doctor: [
    "create_prescriptions",
    "view_assigned_patients",
    "create_checkups",
    "view_checkups",
    "view_patient_labs",
    "view_clinic_stock_readonly",
  ],
  pharmacy_manager: [
    "manage_inventory",
    "dispense_prescriptions",
    "generate_invoices",
    "view_pharmacy_analytics",
  ],
  receptionist: [
    "manage_schedules",
    "block_doctor_calendar",
    "manage_appointments",
    "assign_doctor_patient",
    "view_checkups",
    "register_walkin_patient",
  ],
  patient: [
    "view_own_prescriptions",
    "record_intake",
    "upload_labs",
    "view_own_checkups",
    "view_own_appointments",
    "view_own_invoices",
  ],
};

function getDefaultPermissionsForRole(role) {
  return [...(DEFAULT_ROLE_PERMISSIONS[role] || [])];
}

function sanitizePermissions(perms) {
  if (!Array.isArray(perms)) return [];
  const unique = new Set();
  for (const p of perms) {
    if (typeof p === "string" && VALID_PERMISSION_KEYS.has(p)) {
      unique.add(p);
    }
  }
  return Array.from(unique);
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.is_superadmin && user.role === "admin") return true;
  let perms = user.permissions;
  if (typeof perms === "string") {
    try {
      perms = JSON.parse(perms);
    } catch {
      perms = [];
    }
  }
  if (Array.isArray(perms) && perms.length > 0) {
    return perms.includes(permission);
  }
  // Fallback for legacy tokens/rows without populated permissions array
  return getDefaultPermissionsForRole(user.role).includes(permission);
}

module.exports = {
  VALID_ROLES,
  STAFF_ROLES,
  SELF_REGISTER_ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  getDefaultPermissionsForRole,
  sanitizePermissions,
  hasPermission,
};

