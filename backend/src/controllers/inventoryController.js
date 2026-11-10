const inventoryModel = require("../models/inventoryModel");
const pool = require("../utils/db");

exports.getInventory = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const items = await inventoryModel.getInventory(orgId);
    res.json({ success: true, items });
  } catch (error) {
    console.error("Get Inventory Error:", error);
    res.status(500).json({ success: false, message: "Server error loading inventory" });
  }
};

exports.addInventoryItem = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const actorId = req.user.id;
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
    const costPrice = body.costPrice !== undefined ? body.costPrice : body.cost_price;
    const supplierName = body.supplierName || body.supplier_name;

    if (!medicineName || medicineName.toString().trim().length === 0) {
      return res.status(400).json({ success: false, message: "Medicine name is required" });
    }

    const newItem = await inventoryModel.addInventoryItem({
      organizationId: orgId,
      actorId,
      medicineName: medicineName.toString().trim(),
      brandName: brandName ? brandName.toString().trim() : null,
      strength: strength ? strength.toString().trim() : null,
      form: form || "Tablet",
      stockQuantity: parseInt(stockQuantity, 10) || 0,
      batchNumber: batchNumber ? batchNumber.toString().trim() : null,
      expiryDate: expiryDate || null,
      reorderLevel: parseInt(reorderLevel, 10) || 10,
      sellingPrice: sellingPrice !== null && sellingPrice !== undefined && sellingPrice !== "" ? parseFloat(sellingPrice) : null,
      costPrice: costPrice !== null && costPrice !== undefined && costPrice !== "" ? parseFloat(costPrice) : null,
      supplierName: supplierName ? supplierName.toString().trim() : null,
    });

    res.status(201).json({ success: true, item: newItem });
  } catch (error) {
    console.error("Add Inventory Item Error:", error);
    res.status(500).json({ success: false, message: "Server error adding inventory item" });
  }
};

exports.updateInventoryItem = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;

    const updatedItem = await inventoryModel.updateInventoryItem(id, orgId, req.body, req.user.id);
    if (!updatedItem) {
      return res.status(404).json({ success: false, message: "Item not found in your clinic inventory" });
    }

    res.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error("Update Inventory Item Error:", error);
    res.status(500).json({ success: false, message: "Server error updating inventory item" });
  }
};

exports.restockItem = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;
    const { addQuantity, batchNumber, expiryDate, notes } = req.body || {};
    const addQty = parseInt(addQuantity, 10);

    if (!addQty || addQty <= 0) {
      return res.status(400).json({ success: false, message: "Positive addQuantity is required" });
    }

    await client.query("BEGIN");
    const curRes = await client.query(
      `SELECT * FROM clinic_inventory WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, orgId]
    );
    if (curRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }

    const updatedRes = await client.query(
      `UPDATE clinic_inventory
       SET stock_quantity = stock_quantity + $2,
           batch_number = COALESCE($3, batch_number),
           expiry_date = COALESCE($4, expiry_date),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *, GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))::int AS available_quantity`,
      [id, addQty, batchNumber || null, expiryDate || null]
    );

    await inventoryModel.recordMovement(client, {
      organizationId: orgId,
      inventoryId: parseInt(id, 10),
      movementType: "restock",
      quantityChange: addQty,
      actorId: req.user.id,
      notes: notes || `Restocked +${addQty} units`,
    });

    await client.query("COMMIT");
    res.json({ success: true, item: updatedRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Restock Error:", error);
    res.status(500).json({ success: false, message: "Server error restocking item" });
  } finally {
    client.release();
  }
};

exports.deleteInventoryItem = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;

    const deleted = await inventoryModel.deleteInventoryItem(id, orgId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Item not found in your clinic inventory" });
    }

    res.json({ success: true, message: "Inventory item deleted" });
  } catch (error) {
    console.error("Delete Inventory Item Error:", error);
    res.status(500).json({ success: false, message: "Server error deleting inventory item" });
  }
};

exports.searchInventory = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ success: true, items: [] });
    }

    const items = await inventoryModel.searchInventory(orgId, q);
    res.json({ success: true, items });
  } catch (error) {
    console.error("Search Inventory Error:", error);
    res.status(500).json({ success: false, message: "Server error searching inventory" });
  }
};
