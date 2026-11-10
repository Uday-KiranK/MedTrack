const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const { authorizeRole, authorizePermission } = require("../middleware/roleMiddleware");
const pharmacyController = require("../controllers/pharmacyController");

router.use(authenticate);

// Patient route to view their own pharmacy bills/invoices
router.get(
  "/my-invoices",
  authorizeRole("patient"),
  authorizePermission("view_own_invoices"),
  pharmacyController.getMyInvoices
);

// Pharmacy Manager routes
router.use(authorizeRole("pharmacy_manager"));

router.get("/orders", authorizePermission("dispense_prescriptions"), pharmacyController.getPharmacyOrders);
router.post("/orders/:orderId/dispense", authorizePermission("dispense_prescriptions"), pharmacyController.dispenseOrder);
router.post("/orders/:orderId/cancel", authorizePermission("dispense_prescriptions"), pharmacyController.cancelOrder);

router.get("/invoices", authorizePermission("generate_invoices", "view_pharmacy_analytics"), pharmacyController.getInvoices);
router.patch("/invoices/:id/pay", authorizePermission("generate_invoices"), pharmacyController.markInvoicePaid);

router.get("/analytics", authorizePermission("view_pharmacy_analytics", "manage_inventory"), pharmacyController.getPharmacyAnalytics);
router.get("/movements", authorizePermission("view_pharmacy_analytics", "manage_inventory"), pharmacyController.getMovements);

module.exports = router;

