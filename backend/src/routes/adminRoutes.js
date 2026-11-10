const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const { authorizeRole, authorizePermission } = require("../middleware/roleMiddleware");
const adminController = require("../controllers/adminController");

router.use(authenticate);
router.use(authorizeRole("admin"));

router.get("/roles-metadata", adminController.getRolesMetadata);
router.get("/overview", authorizePermission("view_org_analytics"), adminController.getOverview);
router.get("/users", authorizePermission("manage_staff", "approve_staff", "assign_roles"), adminController.listUsers);
router.get("/pending", authorizePermission("approve_staff", "manage_staff"), adminController.getPendingApprovals);
router.post("/users", authorizePermission("manage_staff"), adminController.createStaffUser);
router.patch("/users/:id/approve", authorizePermission("approve_staff"), adminController.approveStaffUser);
router.patch("/users/:id", authorizePermission("manage_staff", "assign_roles"), adminController.updateStaffUser);
router.delete("/users/:id", authorizePermission("manage_staff"), adminController.removeStaffUser);
router.get("/organization", adminController.getOrganization);
router.put("/organization", authorizePermission("manage_organization"), adminController.updateOrganization);
router.get("/audit-logs", authorizePermission("view_audit_logs"), adminController.getAuditLogs);

module.exports = router;

