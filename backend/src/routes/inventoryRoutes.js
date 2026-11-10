const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const { authorizeRole, authorizePermission } = require("../middleware/roleMiddleware");
const inventoryController = require("../controllers/inventoryController");

router.use(authenticate);

// Read-only clinic stock search for Doctors (when prescribing) and Pharmacy Managers
router.get(
  "/search",
  authorizePermission("view_clinic_stock_readonly", "manage_inventory"),
  inventoryController.searchInventory
);

// Pharmacy Manager CRUD endpoints (Doctor no longer manages inventory)
router.use(authorizeRole("pharmacy_manager"));
router.use(authorizePermission("manage_inventory"));

router.get("/", inventoryController.getInventory);
router.post("/", inventoryController.addInventoryItem);
router.post("/:id/restock", inventoryController.restockItem);
router.put("/:id", inventoryController.updateInventoryItem);
router.delete("/:id", inventoryController.deleteInventoryItem);

module.exports = router;
