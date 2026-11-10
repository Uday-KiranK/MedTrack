const pool = require("../utils/db");
const { recordMovement } = require("../models/inventoryModel");
const { hasPermission } = require("../utils/permissions");

const generateInvoiceNumber = (orderId) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}${d}-${orderId || "0"}-${rand}`;
};

exports.getPharmacyOrders = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { status } = req.query;

    const conditions = ["po.organization_id = $1"];
    const params = [orgId];
    if (status && status !== "all") {
      conditions.push(`po.status = $2`);
      params.push(status);
    }

    const ordersRes = await pool.query(
      `SELECT po.id, po.prescription_id, po.status, po.notes, po.created_at, po.dispensed_at,
              pat.id AS patient_id, pat.name AS patient_name, pat.phone AS patient_phone,
              doc.id AS doctor_id, doc.name AS doctor_name, doc.specialization AS doctor_specialization,
              inv.id AS invoice_id, inv.invoice_number, inv.total_amount AS invoice_total, inv.payment_status
       FROM pharmacy_orders po
       JOIN users pat ON po.patient_id = pat.id
       JOIN users doc ON po.doctor_id = doc.id
       LEFT JOIN invoices inv ON inv.order_id = po.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY CASE WHEN po.status = 'pending' THEN 0 WHEN po.status = 'partially_dispensed' THEN 1 ELSE 2 END, po.created_at DESC`,
      params
    );

    const orderIds = ordersRes.rows.map((o) => o.id);
    let itemsByOrder = {};
    if (orderIds.length > 0) {
      const itemsRes = await pool.query(
        `SELECT poi.*,
                ci.batch_number, ci.expiry_date, ci.stock_quantity, ci.reserved_quantity,
                ci.selling_price AS current_selling_price,
                GREATEST(0, COALESCE(ci.stock_quantity, 0) - COALESCE(ci.reserved_quantity, 0))::int AS unreserved_stock
         FROM pharmacy_order_items poi
         LEFT JOIN clinic_inventory ci ON poi.inventory_id = ci.id
         WHERE poi.order_id = ANY($1::int[])
         ORDER BY poi.id ASC`,
        [orderIds]
      );
      for (const item of itemsRes.rows) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push(item);
      }
    }

    const orders = ordersRes.rows.map((o) => ({
      ...o,
      items: itemsByOrder[o.id] || [],
    }));

    res.json({ success: true, orders });
  } catch (error) {
    console.error("Get Pharmacy Orders Error:", error);
    res.status(500).json({ success: false, message: "Server error loading pharmacy queue" });
  }
};

exports.dispenseOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id || 1;
    const { orderId } = req.params;
    const {
      items: requestedItems,
      discountAmount = 0,
      taxPercent = 0,
      paymentStatus = "paid",
      paymentMethod = "cash",
      notes = "",
    } = req.body || {};

    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT * FROM pharmacy_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [orderId, orgId]
    );
    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Pharmacy order not found" });
    }
    const order = orderRes.rows[0];

    if (order.status === "dispensed" || order.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: `Order is already ${order.status}` });
    }

    const dbItemsRes = await client.query(
      `SELECT * FROM pharmacy_order_items WHERE order_id = $1 ORDER BY id ASC FOR UPDATE`,
      [order.id]
    );
    const dbItems = dbItemsRes.rows;

    const reqMap = new Map();
    if (Array.isArray(requestedItems)) {
      for (const r of requestedItems) {
        if (r && r.orderItemId) reqMap.set(parseInt(r.orderItemId, 10), r);
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let subtotal = 0;
    const invoiceLines = [];
    let anyDispensed = false;
    let anyShortfall = false;

    for (const item of dbItems) {
      if (item.status === "dispensed") continue;

      const reqOverride = reqMap.get(item.id);
      const targetInventoryId = reqOverride?.inventoryId || item.inventory_id;
      const desiredQty = reqOverride && reqOverride.dispensedUnits !== undefined
        ? Math.max(0, parseInt(reqOverride.dispensedUnits, 10) || 0)
        : (item.reserved_units > 0 ? item.reserved_units : item.prescribed_units);

      let invItem = null;
      if (targetInventoryId) {
        const invRes = await client.query(
          `SELECT * FROM clinic_inventory WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [targetInventoryId, orgId]
        );
        invItem = invRes.rows[0] || null;
      }

      if (desiredQty > 0 && invItem) {
        if (invItem.expiry_date && new Date(invItem.expiry_date) < today) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: `Cannot dispense expired batch (${invItem.batch_number || "N/A"}) for ${item.medicine_name}`,
          });
        }
        if ((invItem.stock_quantity || 0) < desiredQty) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.medicine_name} (Available total: ${invItem.stock_quantity}, Requested: ${desiredQty})`,
          });
        }
      }

      // Release original reservation on item.inventory_id if it had any
      if (item.inventory_id && item.reserved_units > 0) {
        await client.query(
          `UPDATE clinic_inventory
           SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - $2),
               updated_at = NOW()
           WHERE id = $1`,
          [item.inventory_id, item.reserved_units]
        );
      }

      // Deduct actual dispensed quantity from stock_quantity
      if (desiredQty > 0 && invItem) {
        await client.query(
          `UPDATE clinic_inventory
           SET stock_quantity = GREATEST(0, stock_quantity - $2),
               updated_at = NOW()
           WHERE id = $1`,
          [invItem.id, desiredQty]
        );

        await recordMovement(client, {
          organizationId: orgId,
          inventoryId: invItem.id,
          movementType: "dispense",
          quantityChange: -desiredQty,
          actorId: req.user.id,
          referenceId: order.id,
          notes: `Dispensed ${desiredQty} unit(s) for Rx #${order.prescription_id}`,
        });
      }

      const unitPrice = invItem && invItem.selling_price !== null
        ? parseFloat(invItem.selling_price)
        : (parseFloat(item.unit_price) || 0);
      const lineTotal = Number((unitPrice * desiredQty).toFixed(2));

      if (desiredQty > 0) {
        anyDispensed = true;
        subtotal += lineTotal;
        invoiceLines.push({
          inventoryId: invItem ? invItem.id : null,
          medicineName: item.medicine_name,
          batchNumber: invItem ? invItem.batch_number : null,
          quantity: desiredQty,
          unitPrice,
          lineTotal,
        });
      }

      if (desiredQty < item.prescribed_units) {
        anyShortfall = true;
      }

      const nextItemStatus = desiredQty > 0 ? "dispensed" : "unavailable";
      await client.query(
        `UPDATE pharmacy_order_items
         SET inventory_id = $2,
             reserved_units = 0,
             dispensed_units = dispensed_units + $3,
             unit_price = $4,
             status = $5
         WHERE id = $1`,
        [item.id, invItem ? invItem.id : item.inventory_id, desiredQty, unitPrice, nextItemStatus]
      );
    }

    if (!anyDispensed) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No items had positive dispensed quantity. Restock or cancel order instead.",
      });
    }

    const nextOrderStatus = anyShortfall ? "partially_dispensed" : "dispensed";
    const updOrderRes = await client.query(
      `UPDATE pharmacy_orders
       SET status = $2, dispensed_by = $3, dispensed_at = NOW(), notes = COALESCE($4, notes)
       WHERE id = $1
       RETURNING *`,
      [order.id, nextOrderStatus, req.user.id, notes || null]
    );

    // Create itemized invoice if user has generate_invoices permission (or default pharmacist role)
    let createdInvoice = null;
    if (hasPermission(req.user, "generate_invoices")) {
      const safeDiscount = Math.max(0, Math.min(subtotal, parseFloat(discountAmount) || 0));
      const taxable = Math.max(0, subtotal - safeDiscount);
      const safeTaxPct = Math.max(0, parseFloat(taxPercent) || 0);
      const taxAmount = Number(((taxable * safeTaxPct) / 100).toFixed(2));
      const totalAmount = Number((taxable + taxAmount).toFixed(2));
      const invNumber = generateInvoiceNumber(order.id);
      const validPayStatuses = ["paid", "unpaid", "waived"];
      const finalPayStatus = validPayStatuses.includes(paymentStatus) ? paymentStatus : "unpaid";

      const invRes = await client.query(
        `INSERT INTO invoices (
          invoice_number, organization_id, order_id, prescription_id, patient_id, issued_by,
          subtotal, discount_amount, tax_percent, tax_amount, total_amount,
          payment_status, payment_method, paid_at, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *`,
        [
          invNumber,
          orgId,
          order.id,
          order.prescription_id,
          order.patient_id,
          req.user.id,
          Number(subtotal.toFixed(2)),
          Number(safeDiscount.toFixed(2)),
          safeTaxPct,
          taxAmount,
          totalAmount,
          finalPayStatus,
          finalPayStatus === "paid" ? (paymentMethod || "cash") : null,
          finalPayStatus === "paid" ? new Date() : null,
          notes || null,
        ]
      );
      createdInvoice = invRes.rows[0];

      for (const line of invoiceLines) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, inventory_id, medicine_name, batch_number, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [createdInvoice.id, line.inventoryId, line.medicineName, line.batchNumber, line.quantity, line.unitPrice, line.lineTotal]
        );
      }
      createdInvoice.items = invoiceLines;
    }

    await client.query("COMMIT");
    res.json({
      success: true,
      message: createdInvoice ? `Dispensed & Invoice ${createdInvoice.invoice_number} generated` : "Medicines dispensed",
      order: updOrderRes.rows[0],
      invoice: createdInvoice,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Dispense Order Error:", error);
    res.status(500).json({ success: false, message: "Server error dispensing order" });
  } finally {
    client.release();
  }
};

exports.cancelOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id || 1;
    const { orderId } = req.params;
    const { notes } = req.body || {};

    await client.query("BEGIN");
    const orderRes = await client.query(
      `SELECT * FROM pharmacy_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [orderId, orgId]
    );
    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const order = orderRes.rows[0];
    if (order.status === "dispensed" || order.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: `Cannot cancel order with status '${order.status}'` });
    }

    const itemsRes = await client.query(
      `SELECT * FROM pharmacy_order_items WHERE order_id = $1 FOR UPDATE`,
      [order.id]
    );

    for (const item of itemsRes.rows) {
      if (item.inventory_id && item.reserved_units > 0) {
        await client.query(
          `UPDATE clinic_inventory
           SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - $2),
               updated_at = NOW()
           WHERE id = $1`,
          [item.inventory_id, item.reserved_units]
        );
        await recordMovement(client, {
          organizationId: orgId,
          inventoryId: item.inventory_id,
          movementType: "release",
          quantityChange: -item.reserved_units,
          actorId: req.user.id,
          referenceId: order.id,
          notes: `Released reservation on order #${order.id} cancellation`,
        });
      }
      await client.query(
        `UPDATE pharmacy_order_items SET reserved_units = 0, status = 'cancelled' WHERE id = $1`,
        [item.id]
      );
    }

    const upd = await client.query(
      `UPDATE pharmacy_orders SET status = 'cancelled', notes = COALESCE($2, notes) WHERE id = $1 RETURNING *`,
      [order.id, notes || null]
    );

    await client.query("COMMIT");
    res.json({ success: true, order: upd.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Cancel Order Error:", error);
    res.status(500).json({ success: false, message: "Server error cancelling order" });
  } finally {
    client.release();
  }
};

exports.getInvoices = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { status } = req.query;

    const conditions = ["inv.organization_id = $1"];
    const params = [orgId];
    if (status && status !== "all") {
      conditions.push(`inv.payment_status = $2`);
      params.push(status);
    }

    const invRes = await pool.query(
      `SELECT inv.*, pat.name AS patient_name, pat.phone AS patient_phone, issuer.name AS issued_by_name
       FROM invoices inv
       JOIN users pat ON inv.patient_id = pat.id
       LEFT JOIN users issuer ON inv.issued_by = issuer.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY inv.created_at DESC
       LIMIT 100`,
      params
    );

    const invIds = invRes.rows.map((i) => i.id);
    const itemsMap = {};
    if (invIds.length > 0) {
      const itemsRes = await pool.query(
        `SELECT * FROM invoice_items WHERE invoice_id = ANY($1::int[]) ORDER BY id ASC`,
        [invIds]
      );
      for (const item of itemsRes.rows) {
        if (!itemsMap[item.invoice_id]) itemsMap[item.invoice_id] = [];
        itemsMap[item.invoice_id].push(item);
      }
    }

    const invoices = invRes.rows.map((i) => ({ ...i, items: itemsMap[i.id] || [] }));
    res.json({ success: true, invoices });
  } catch (error) {
    console.error("Get Invoices Error:", error);
    res.status(500).json({ success: false, message: "Server error loading invoices" });
  }
};

exports.markInvoicePaid = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const { id } = req.params;
    const { paymentMethod = "cash", paymentStatus = "paid" } = req.body || {};

    const valid = ["paid", "unpaid", "waived"];
    if (!valid.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "Invalid payment status" });
    }

    const resUpd = await pool.query(
      `UPDATE invoices
       SET payment_status = $3::varchar,
           payment_method = COALESCE($4, payment_method),
           paid_at = CASE WHEN $3::varchar = 'paid' THEN NOW() ELSE NULL END
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, orgId, paymentStatus, paymentMethod]
    );
    if (resUpd.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    res.json({ success: true, invoice: resUpd.rows[0] });
  } catch (error) {
    console.error("Mark Invoice Paid Error:", error);
    res.status(500).json({ success: false, message: "Server error updating invoice" });
  }
};

exports.getMyInvoices = async (req, res) => {
  try {
    const patientId = req.user.id;
    const invRes = await pool.query(
      `SELECT inv.*, issuer.name AS issued_by_name
       FROM invoices inv
       LEFT JOIN users issuer ON inv.issued_by = issuer.id
       WHERE inv.patient_id = $1
       ORDER BY inv.created_at DESC
       LIMIT 50`,
      [patientId]
    );
    const invIds = invRes.rows.map((i) => i.id);
    const itemsMap = {};
    if (invIds.length > 0) {
      const itemsRes = await pool.query(
        `SELECT * FROM invoice_items WHERE invoice_id = ANY($1::int[]) ORDER BY id ASC`,
        [invIds]
      );
      for (const item of itemsRes.rows) {
        if (!itemsMap[item.invoice_id]) itemsMap[item.invoice_id] = [];
        itemsMap[item.invoice_id].push(item);
      }
    }
    res.json({
      success: true,
      invoices: invRes.rows.map((i) => ({ ...i, items: itemsMap[i.id] || [] })),
    });
  } catch (error) {
    console.error("Get My Invoices Error:", error);
    res.status(500).json({ success: false, message: "Server error loading invoices" });
  }
};

exports.getPharmacyAnalytics = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;

    const [
      invSummaryRes,
      alertsRes,
      depletionRes,
      revenueRes,
      topDispensedRes,
      pendingOrdersRes,
    ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_skus,
           COALESCE(SUM(stock_quantity), 0)::int AS total_units,
           COALESCE(SUM(reserved_quantity), 0)::int AS reserved_units,
           COALESCE(SUM(stock_quantity * COALESCE(selling_price, 0)), 0)::numeric(12,2) AS total_retail_value,
           COALESCE(SUM(stock_quantity * COALESCE(cost_price, 0)), 0)::numeric(12,2) AS total_cost_value
         FROM clinic_inventory
         WHERE organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT id, medicine_name, brand_name, strength, form, batch_number, expiry_date,
                stock_quantity, COALESCE(reserved_quantity, 0)::int AS reserved_quantity,
                GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))::int AS available_quantity,
                COALESCE(reorder_level, 10)::int AS reorder_level
         FROM clinic_inventory
         WHERE organization_id = $1
         ORDER BY available_quantity ASC`,
        [orgId]
      ),
      pool.query(
        `SELECT ci.id, ci.medicine_name, ci.strength, ci.form,
                GREATEST(0, ci.stock_quantity - COALESCE(ci.reserved_quantity, 0))::int AS available_quantity,
                ABS(COALESCE(SUM(im.quantity_change), 0))::numeric AS dispensed_30d
         FROM clinic_inventory ci
         LEFT JOIN inventory_movements im
           ON im.inventory_id = ci.id
          AND im.movement_type = 'dispense'
          AND im.created_at >= NOW() - INTERVAL '30 days'
         WHERE ci.organization_id = $1
         GROUP BY ci.id`,
        [orgId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS invoices_count,
           COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric(12,2) AS paid_revenue,
           COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'unpaid'), 0)::numeric(12,2) AS unpaid_pending,
           COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND paid_at >= CURRENT_DATE), 0)::numeric(12,2) AS today_revenue
         FROM invoices
         WHERE organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT ci.medicine_name, ci.strength,
                ABS(SUM(im.quantity_change))::int AS total_dispensed
         FROM inventory_movements im
         JOIN clinic_inventory ci ON im.inventory_id = ci.id
         WHERE im.organization_id = $1
           AND im.movement_type = 'dispense'
           AND im.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY ci.medicine_name, ci.strength
         ORDER BY total_dispensed DESC
         LIMIT 5`,
        [orgId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS pending_orders
         FROM pharmacy_orders
         WHERE organization_id = $1 AND status IN ('pending', 'partially_dispensed')`,
        [orgId]
      ),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const outOfStock = [];
    const lowStock = [];
    const expired = [];
    const expiringSoon = [];

    for (const item of alertsRes.rows) {
      if (item.available_quantity <= 0) outOfStock.push(item);
      else if (item.stock_quantity <= item.reorder_level) lowStock.push(item);

      if (item.expiry_date && item.stock_quantity > 0) {
        const exp = new Date(item.expiry_date);
        if (exp < today) expired.push(item);
        else if (exp <= in30Days) expiringSoon.push(item);
      }
    }

    const depletionForecast = [];
    for (const row of depletionRes.rows) {
      const dispensed30 = parseFloat(row.dispensed_30d) || 0;
      if (dispensed30 > 0) {
        const dailyRate = dispensed30 / 30;
        const daysLeft = Math.floor(row.available_quantity / dailyRate);
        if (daysLeft <= 14) {
          depletionForecast.push({
            id: row.id,
            medicine_name: row.medicine_name,
            strength: row.strength,
            available_quantity: row.available_quantity,
            daily_rate: Number(dailyRate.toFixed(2)),
            estimated_days_left: daysLeft,
          });
        }
      }
    }
    depletionForecast.sort((a, b) => a.estimated_days_left - b.estimated_days_left);

    const val = invSummaryRes.rows[0] || {};
    const rev = revenueRes.rows[0] || {};

    res.json({
      success: true,
      analytics: {
        pendingOrdersCount: pendingOrdersRes.rows[0]?.pending_orders || 0,
        valuation: {
          total_skus: val.total_skus || 0,
          total_units: val.total_units || 0,
          reserved_units: val.reserved_units || 0,
          total_retail_value: parseFloat(val.total_retail_value) || 0,
          total_cost_value: parseFloat(val.total_cost_value) || 0,
        },
        revenue: {
          invoices_count: rev.invoices_count || 0,
          paid_revenue: parseFloat(rev.paid_revenue) || 0,
          unpaid_pending: parseFloat(rev.unpaid_pending) || 0,
          today_revenue: parseFloat(rev.today_revenue) || 0,
        },
        warnings: {
          outOfStock,
          lowStock,
          expired,
          expiringSoon,
          depletionForecast,
        },
        topDispensed: topDispensedRes.rows,
      },
    });
  } catch (error) {
    console.error("Pharmacy Analytics Error:", error);
    res.status(500).json({ success: false, message: "Server error loading pharmacy analytics" });
  }
};

exports.getMovements = async (req, res) => {
  try {
    const orgId = req.user.organization_id || 1;
    const resMov = await pool.query(
      `SELECT im.*, ci.medicine_name, ci.strength, ci.batch_number, u.name AS actor_name
       FROM inventory_movements im
       JOIN clinic_inventory ci ON im.inventory_id = ci.id
       LEFT JOIN users u ON im.actor_id = u.id
       WHERE im.organization_id = $1
       ORDER BY im.created_at DESC
       LIMIT 60`,
      [orgId]
    );
    res.json({ success: true, movements: resMov.rows });
  } catch (error) {
    console.error("Get Movements Error:", error);
    res.status(500).json({ success: false, message: "Server error loading stock movements" });
  }
};
