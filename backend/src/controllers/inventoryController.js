const inventoryModel = require("../models/inventoryModel");

exports.getInventory = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const items = await inventoryModel.getInventory(doctorId);
    res.json({ success: true, items });
  } catch (error) {
    console.error("Get Inventory Error:", error);
    res.status(500).json({ success: false, message: "Server error loading inventory" });
  }
};

exports.addInventoryItem = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const {
      medicineName,
      brandName,
      strength,
      form,
      stockQuantity,
      batchNumber,
      expiryDate,
      reorderLevel,
      sellingPrice
    } = req.body;

    if (!medicineName) {
      return res.status(400).json({ success: false, message: "Medicine name is required" });
    }

    const newItem = await inventoryModel.addInventoryItem({
      doctorId,
      medicineName,
      brandName,
      strength,
      form,
      stockQuantity: parseInt(stockQuantity, 10) || 0,
      batchNumber,
      expiryDate: expiryDate || null,
      reorderLevel: parseInt(reorderLevel, 10) || 10,
      sellingPrice: parseFloat(sellingPrice) || null
    });

    res.status(201).json({ success: true, item: newItem });
  } catch (error) {
    console.error("Add Inventory Item Error:", error);
    res.status(500).json({ success: false, message: "Server error adding inventory item" });
  }
};

exports.updateInventoryItem = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;

    const updatedItem = await inventoryModel.updateInventoryItem(id, doctorId, req.body);
    if (!updatedItem) {
      return res.status(404).json({ success: false, message: "Item not found or unauthorized" });
    }

    res.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error("Update Inventory Item Error:", error);
    res.status(500).json({ success: false, message: "Server error updating inventory item" });
  }
};

exports.deleteInventoryItem = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { id } = req.params;

    const deleted = await inventoryModel.deleteInventoryItem(id, doctorId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Item not found or unauthorized" });
    }

    res.json({ success: true, message: "Inventory item deleted" });
  } catch (error) {
    console.error("Delete Inventory Item Error:", error);
    res.status(500).json({ success: false, message: "Server error deleting inventory item" });
  }
};

exports.searchInventory = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ success: true, items: [] });
    }

    const items = await inventoryModel.searchInventory(doctorId, q);
    res.json({ success: true, items });
  } catch (error) {
    console.error("Search Inventory Error:", error);
    res.status(500).json({ success: false, message: "Server error searching inventory" });
  }
};
