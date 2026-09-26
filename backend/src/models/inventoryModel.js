const pool = require("../utils/db");

const getInventory = async (doctorId) => {
  const result = await pool.query(
    `SELECT * FROM clinic_inventory 
     WHERE doctor_id = $1 
     ORDER BY created_at DESC`,
    [doctorId]
  );
  return result.rows;
};

const addInventoryItem = async (data) => {
  const {
    doctorId,
    medicineName,
    brandName,
    strength,
    form,
    stockQuantity,
    batchNumber,
    expiryDate,
    reorderLevel,
    sellingPrice
  } = data;

  const result = await pool.query(
    `INSERT INTO clinic_inventory (
      doctor_id, medicine_name, brand_name, strength, form,
      stock_quantity, batch_number, expiry_date, reorder_level, selling_price
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      doctorId,
      medicineName,
      brandName || null,
      strength || null,
      form || 'Tablet',
      stockQuantity || 0,
      batchNumber || null,
      expiryDate || null,
      reorderLevel || 10,
      sellingPrice || null
    ]
  );
  return result.rows[0];
};

const updateInventoryItem = async (id, doctorId, data) => {
  const fields = [];
  const values = [id, doctorId];
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
    selling_price: "selling_price"
  };

  const processedCols = new Set();
  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined && !processedCols.has(col)) {
      processedCols.add(col);
      fields.push(`${col} = $${paramIdx}`);
      values.push(data[key]);
      paramIdx++;
    }
  }

  if (fields.length === 0) return null;

  const query = `UPDATE clinic_inventory SET ${fields.join(", ")} WHERE id = $1 AND doctor_id = $2 RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0];
};

const deleteInventoryItem = async (id, doctorId) => {
  const result = await pool.query(
    `DELETE FROM clinic_inventory WHERE id = $1 AND doctor_id = $2 RETURNING *`,
    [id, doctorId]
  );
  return result.rows[0];
};

const searchInventory = async (doctorId, queryStr) => {
  const searchPattern = `%${queryStr.trim()}%`;
  const result = await pool.query(
    `SELECT * FROM clinic_inventory 
     WHERE doctor_id = $1 AND (
       medicine_name ILIKE $2 OR 
       brand_name ILIKE $2 OR 
       strength ILIKE $2
     ) 
     ORDER BY stock_quantity DESC LIMIT 10`,
    [doctorId, searchPattern]
  );
  return result.rows;
};

const deductStock = async (doctorId, medDetails) => {
  try {
    const { medicine_name, dosage, medicine_form, duration_days, custom_times, meal_slots, frequency_per_day } = typeof medDetails === 'object' ? medDetails : { medicine_name: medDetails };
    const rawName = (medicine_name || '').trim();
    const baseName = rawName.split('(')[0].trim();

    // Find matching inventory item
    const findRes = await pool.query(
      `SELECT * FROM clinic_inventory 
       WHERE doctor_id = $1 AND (
         LOWER(TRIM(medicine_name)) = LOWER(TRIM($2)) OR
         LOWER(TRIM(medicine_name)) = LOWER(TRIM($3)) OR
         LOWER(TRIM($2)) LIKE LOWER(CONCAT(TRIM(medicine_name), '%'))
       )
       LIMIT 1`,
      [doctorId, rawName, baseName]
    );

    if (findRes.rows.length === 0) return null;

    const invItem = findRes.rows[0];
    const form = invItem.form || medicine_form || 'Tablet';
    const strengthStr = invItem.strength || '';

    // Calculate prescribed dosage number per intake (e.g. "10ml" -> 10, "1 Tablet" -> 1, "2 Tablets" -> 2)
    let dosagePerIntake = 1;
    const dosageMatch = (dosage || '').toString().match(/(\d+(\.\d+)?)/);
    if (dosageMatch) {
      dosagePerIntake = parseFloat(dosageMatch[1]) || 1;
    }

    // Calculate intakes per day
    let intakesPerDay = 1;
    if (Array.isArray(meal_slots) && meal_slots.length > 0) {
      intakesPerDay = meal_slots.length;
    } else if (Array.isArray(custom_times) && custom_times.length > 0) {
      intakesPerDay = custom_times.length;
    } else if (frequency_per_day) {
      intakesPerDay = parseInt(frequency_per_day, 10) || 1;
    }

    const duration = parseInt(duration_days || '7', 10) || 7;
    const totalPrescribedAmount = dosagePerIntake * intakesPerDay * duration;

    let unitsToDeduct = 1;

    if (form === 'Syrup' || form === 'Drops' || form === 'Ointment') {
      let packSize = 50; // Default 50ml bottle
      const sizeMatch = strengthStr.match(/(\d+(\.\d+)?)\s*(ml|g)/i);
      if (sizeMatch) {
        packSize = parseFloat(sizeMatch[1]) || 50;
      }
      unitsToDeduct = Math.ceil(totalPrescribedAmount / packSize);
    } else if (form === 'Tablet' || form === 'Capsule') {
      let stripSize = 10; // Default 10 tablets per strip/pack
      const stripMatch = strengthStr.match(/(\d+)\s*(tab|strip|cap)/i);
      if (stripMatch) {
        stripSize = parseInt(stripMatch[1], 10) || 10;
      }
      unitsToDeduct = Math.ceil(totalPrescribedAmount / stripSize);
    } else {
      unitsToDeduct = Math.ceil(totalPrescribedAmount);
    }

    if (unitsToDeduct < 1) unitsToDeduct = 1;

    const updateRes = await pool.query(
      `UPDATE clinic_inventory 
       SET stock_quantity = GREATEST(0, stock_quantity - $2)
       WHERE id = $1
       RETURNING *`,
      [invItem.id, unitsToDeduct]
    );

    return updateRes.rows[0] || null;
  } catch (err) {
    console.error("Deduct stock error:", err.message);
    return null;
  }
};

module.exports = {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  searchInventory,
  deductStock
};
