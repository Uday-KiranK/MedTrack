const pool = require("../utils/db");

const recordMovement = async (client, { organizationId, inventoryId, movementType, quantityChange, actorId = null, referenceId = null, notes = null }) => {
  await client.query(
    `INSERT INTO inventory_movements (organization_id, inventory_id, movement_type, quantity_change, actor_id, reference_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [organizationId, inventoryId, movementType, quantityChange, actorId, referenceId, notes]
  );
};

const getInventory = async (organizationId) => {
  const result = await pool.query(
    `SELECT *,
            GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))::int AS available_quantity
     FROM clinic_inventory
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  );
  return result.rows;
};

const addInventoryItem = async (data) => {
  const {
    organizationId,
    actorId,
    medicineName,
    brandName,
    strength,
    form,
    stockQuantity,
    batchNumber,
    expiryDate,
    reorderLevel,
    sellingPrice,
    costPrice,
    supplierName,
  } = data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const qty = parseInt(stockQuantity, 10) || 0;
    const result = await client.query(
      `INSERT INTO clinic_inventory (
        organization_id, doctor_id, medicine_name, brand_name, strength, form,
        stock_quantity, reserved_quantity, batch_number, expiry_date, reorder_level, selling_price, cost_price, supplier_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12, $13)
      RETURNING *, GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))::int AS available_quantity`,
      [
        organizationId,
        actorId || null,
        medicineName,
        brandName || null,
        strength || null,
        form || "Tablet",
        qty,
        batchNumber || null,
        expiryDate || null,
        parseInt(reorderLevel, 10) || 10,
        sellingPrice !== null && sellingPrice !== undefined && sellingPrice !== "" ? sellingPrice : null,
        costPrice !== null && costPrice !== undefined && costPrice !== "" ? costPrice : null,
        supplierName || null,
      ]
    );
    const created = result.rows[0];
    if (qty > 0) {
      await recordMovement(client, {
        organizationId,
        inventoryId: created.id,
        movementType: "initial",
        quantityChange: qty,
        actorId,
        notes: `Initial stock added${batchNumber ? ` (Batch ${batchNumber})` : ""}`,
      });
    }
    await client.query("COMMIT");
    return created;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const updateInventoryItem = async (id, organizationId, data, actorId = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentRes = await client.query(
      `SELECT * FROM clinic_inventory WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, organizationId]
    );
    if (currentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const current = currentRes.rows[0];

    const fields = [];
    const values = [id, organizationId];
    let paramIdx = 3;

    const fieldMap = {
      medicineName: "medicine_name",
      medicine_name: "medicine_name",
      brandName: "brand_name",
      brand_name: "brand_name",
      strength: "strength",
      form: "form",
      stockQuantity: "stock_quantity",
      stock_quantity: "stock_quantity",
      batchNumber: "batch_number",
      batch_number: "batch_number",
      expiryDate: "expiry_date",
      expiry_date: "expiry_date",
      reorderLevel: "reorder_level",
      reorder_level: "reorder_level",
      sellingPrice: "selling_price",
      selling_price: "selling_price",
      costPrice: "cost_price",
      cost_price: "cost_price",
      supplierName: "supplier_name",
      supplier_name: "supplier_name",
    };

    let nextStock = current.stock_quantity;
    const processedCols = new Set();
    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key] !== undefined && !processedCols.has(col)) {
        processedCols.add(col);
        let val = data[key];
        if (col === "stock_quantity") {
          val = Math.max(0, parseInt(val, 10) || 0);
          nextStock = val;
        } else if (col === "reorder_level") {
          val = Math.max(0, parseInt(val, 10) || 0);
        } else if ((col === "selling_price" || col === "cost_price") && val === "") {
          val = null;
        } else if (col === "expiry_date" && val === "") {
          val = null;
        }
        fields.push(`${col} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (fields.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    fields.push("updated_at = NOW()");
    const query = `
      UPDATE clinic_inventory
      SET ${fields.join(", ")}
      WHERE id = $1 AND organization_id = $2
      RETURNING *, GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))::int AS available_quantity
    `;
    const result = await client.query(query, values);
    const updated = result.rows[0];

    const delta = nextStock - (current.stock_quantity || 0);
    if (delta !== 0) {
      await recordMovement(client, {
        organizationId,
        inventoryId: updated.id,
        movementType: delta > 0 ? "restock" : "adjustment",
        quantityChange: delta,
        actorId,
        notes: data.notes || (delta > 0 ? `Restocked +${delta} units` : `Adjusted ${delta} units`),
      });
    }

    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const deleteInventoryItem = async (id, organizationId) => {
  const result = await pool.query(
    `DELETE FROM clinic_inventory WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [id, organizationId]
  );
  return result.rows[0];
};

const searchInventory = async (organizationId, queryStr) => {
  const searchPattern = `%${queryStr.trim()}%`;
  const result = await pool.query(
    `SELECT *,
            GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))::int AS available_quantity
     FROM clinic_inventory
     WHERE organization_id = $1 AND (
       medicine_name ILIKE $2 OR
       brand_name ILIKE $2 OR
       strength ILIKE $2
     )
     ORDER BY
       CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN 1 ELSE 0 END ASC,
       GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0)) DESC,
       expiry_date ASC NULLS LAST
     LIMIT 12`,
    [organizationId, searchPattern]
  );
  return result.rows;
};

const computePrescribedUnits = (medDetails, invItem = null) => {
  const { dosage, medicine_form, duration_days, custom_times, meal_slots, frequency_per_day } =
    typeof medDetails === "object" ? medDetails : { medicine_name: medDetails };
  const form = (invItem && invItem.form) || medicine_form || "Tablet";
  const strengthStr = (invItem && invItem.strength) || "";

  let dosagePerIntake = 1;
  const dosageMatch = (dosage || "").toString().match(/(\d+(\.\d+)?)/);
  if (dosageMatch) {
    dosagePerIntake = parseFloat(dosageMatch[1]) || 1;
  }

  let intakesPerDay = 1;
  if (Array.isArray(meal_slots) && meal_slots.length > 0) {
    intakesPerDay = meal_slots.length;
  } else if (Array.isArray(custom_times) && custom_times.length > 0) {
    intakesPerDay = custom_times.length;
  } else if (frequency_per_day) {
    intakesPerDay = parseInt(frequency_per_day, 10) || 1;
  }

  const duration = parseInt(duration_days || "7", 10) || 7;
  const totalPrescribedAmount = dosagePerIntake * intakesPerDay * duration;

  let units = 1;
  if (form === "Syrup" || form === "Drops" || form === "Ointment") {
    let packSize = 50;
    const sizeMatch = strengthStr.match(/(\d+(\.\d+)?)\s*(ml|g)/i);
    if (sizeMatch) packSize = parseFloat(sizeMatch[1]) || 50;
    units = Math.ceil(totalPrescribedAmount / packSize);
  } else if (form === "Tablet" || form === "Capsule") {
    let stripSize = 10;
    const stripMatch = strengthStr.match(/(\d+)\s*(tab|strip|cap)/i);
    if (stripMatch) stripSize = parseInt(stripMatch[1], 10) || 10;
    units = Math.ceil(totalPrescribedAmount / stripSize);
  } else {
    units = Math.ceil(totalPrescribedAmount);
  }

  return Math.max(1, units);
};

const findBestInventoryMatch = async (client, organizationId, medicineName) => {
  const rawName = (medicineName || "").trim();
  const baseName = rawName.split("(")[0].trim();

  // FEFO: prefer non-expired batch with available stock and earliest expiry date
  const findRes = await client.query(
    `SELECT *, GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))::int AS available_quantity
     FROM clinic_inventory
     WHERE organization_id = $1 AND (
       LOWER(TRIM(medicine_name)) = LOWER(TRIM($2)) OR
       LOWER(TRIM(medicine_name)) = LOWER(TRIM($3)) OR
       LOWER(TRIM($2)) LIKE LOWER(CONCAT(TRIM(medicine_name), '%'))
     )
     ORDER BY
       CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN 1 ELSE 0 END ASC,
       GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0)) DESC,
       expiry_date ASC NULLS LAST
     LIMIT 1
     FOR UPDATE`,
    [organizationId, rawName, baseName]
  );

  return findRes.rows[0] || null;
};

module.exports = {
  recordMovement,
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  searchInventory,
  computePrescribedUnits,
  findBestInventoryMatch,
};
