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
    const body = req.body || {};
    const medicineName = body.medicineName || body.medicine_name;
    const brandName = body.brandName || body.brand_name;
    const strength = body.strength;
    const form = body.form;
    const stockQuantity = body.stockQuantity !== undefined ? body.stockQuantity : body.stock_quantity;
    const batchNumber = body.batchNumber || body.batch_number;
    const expiryDate = body.expiryDate || body.expiry_date;
    const reorderLevel = body.reorderLevel !== undefined ? body.reorderLevel : body.reorder_level;
    const sellingPrice = body.sellingPrice !== undefined ? body.sellingPrice : body.selling_price;

    if (!medicineName || medicineName.toString().trim().length === 0) {
      return res.status(400).json({ success: false, message: "Medicine name is required" });
    }

    const newItem = await inventoryModel.addInventoryItem({
      doctorId,
      medicineName: medicineName.toString().trim(),
      brandName: brandName ? brandName.toString().trim() : null,
      strength: strength ? strength.toString().trim() : null,
      form: form || 'Tablet',
      stockQuantity: parseInt(stockQuantity, 10) || 0,
      batchNumber: batchNumber ? batchNumber.toString().trim() : null,
      expiryDate: expiryDate || null,
      reorderLevel: parseInt(reorderLevel, 10) || 10,
      sellingPrice: sellingPrice !== null && sellingPrice !== undefined && sellingPrice !== '' ? parseFloat(sellingPrice) : null
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
