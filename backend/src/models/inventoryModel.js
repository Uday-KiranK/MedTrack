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
    brandName: "brand_name",
    strength: "strength",
    form: "form",
    stockQuantity: "stock_quantity",
    batchNumber: "batch_number",
    expiryDate: "expiry_date",
    reorderLevel: "reorder_level",
    sellingPrice: "selling_price"
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
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

const deductStock = async (doctorId, medicineName, qty = 1) => {
  try {
    const result = await pool.query(
      `UPDATE clinic_inventory 
       SET stock_quantity = GREATEST(0, stock_quantity - $3)
       WHERE doctor_id = $1 AND LOWER(TRIM(medicine_name)) = LOWER(TRIM($2))
       RETURNING *`,
      [doctorId, medicineName, qty]
    );
    return result.rows[0] || null;
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
