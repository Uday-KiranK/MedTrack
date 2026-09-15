const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const inventoryController = require("../controllers/inventoryController");

router.use(authenticate);
router.use(authorizeRole("doctor"));

router.get("/", inventoryController.getInventory);
router.post("/", inventoryController.addInventoryItem);
router.get("/search", inventoryController.searchInventory);
router.put("/:id", inventoryController.updateInventoryItem);
router.delete("/:id", inventoryController.deleteInventoryItem);

module.exports = router;
