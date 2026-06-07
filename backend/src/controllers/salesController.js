import { query } from '../config/database.js';
import * as R from '../utils/response.js';

// ─── GET /api/sales ───────────────────────────────────────────────────────────
export async function getSales(req, res) {
  const { tenantId } = req.user;
  const { date, from, to, method, page = 1, limit = 50 } = req.query;
  const { offset, limit: lim } = R.paginate(page, limit);

  const conditions = ['s.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (date) {
    conditions.push(`s.sale_date = $${idx++}`);
    params.push(date);
  } else {
    if (from) { conditions.push(`s.sale_date >= $${idx++}`); params.push(from); }
    if (to)   { conditions.push(`s.sale_date <= $${idx++}`); params.push(to);   }
  }
  if (method) {
    conditions.push(`s.payment_method = $${idx++}`);
    params.push(method);
  }

  const where = conditions.join(' AND ');

  const [salesRes, countRes, totalsRes] = await Promise.all([
    query(
      `SELECT s.*, u.name as created_by_name
         FROM sales_entries s
         LEFT JOIN users u ON u.id = s.created_by
        WHERE ${where}
        ORDER BY s.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, lim, offset]
    ),
    query(`SELECT COUNT(*) FROM sales_entries s WHERE ${where}`, params),
    query(
      `SELECT
         COALESCE(SUM(total_amount), 0) as total,
         COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount END), 0) as cash,
         COALESCE(SUM(CASE WHEN payment_method='upi'  THEN total_amount END), 0) as upi,
         COALESCE(SUM(CASE WHEN payment_method='card' THEN total_amount END), 0) as card,
         COUNT(*) as count
       FROM sales_entries s WHERE ${where}`,
      params
    ),
  ]);

  return res.json({
    success: true,
    data:    salesRes.rows,
    totals:  totalsRes.rows[0],
    pagination: {
      total: parseInt(countRes.rows[0].count),
      page:  parseInt(page),
      limit: lim,
      totalPages: Math.ceil(countRes.rows[0].count / lim),
    },
  });
}

// ─── POST /api/sales ──────────────────────────────────────────────────────────
export async function createSale(req, res) {
  const { tenantId, id: userId } = req.user;
  const { itemId, itemName, qty, unitPrice, paymentMethod, notes, customerId, orderId } = req.body;

  // Lookup item price if not provided
  let finalUnitPrice = unitPrice;
  let finalItemName  = itemName;

  if (itemId && !finalUnitPrice) {
    const { rows } = await query(
      'SELECT sell_price, name FROM inventory_items WHERE id = $1 AND tenant_id = $2',
      [itemId, tenantId]
    );
    if (rows[0]) {
      finalUnitPrice = rows[0].sell_price;
      finalItemName  = finalItemName || rows[0].name;
    }
  }

  const totalAmount = parseFloat((finalUnitPrice * qty).toFixed(2));

  const { rows } = await query(
    `INSERT INTO sales_entries(
      tenant_id, item_id, item_name, qty, unit_price,
      total_amount, payment_method, notes,
      customer_id, order_id, created_by
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      tenantId, itemId || null, finalItemName, qty,
      finalUnitPrice, totalAmount, paymentMethod,
      notes || null, customerId || null, orderId || null, userId,
    ]
  );

  return R.created(res, rows[0]);
}

// ─── GET /api/sales/summary ───────────────────────────────────────────────────
export async function getSalesSummary(req, res) {
  const { tenantId } = req.user;
  const { period = 'week' } = req.query;

  let interval;
  let groupBy;

  if (period === 'today') {
    interval = "INTERVAL '1 day'";
    groupBy  = "TO_CHAR(sale_date, 'HH24') as label";
  } else if (period === 'week') {
    interval = "INTERVAL '7 days'";
    groupBy  = "TO_CHAR(sale_date, 'Dy') as label";
  } else if (period === 'month') {
    interval = "INTERVAL '30 days'";
    groupBy  = "TO_CHAR(sale_date, 'DD Mon') as label";
  } else {
    interval = "INTERVAL '12 months'";
    groupBy  = "TO_CHAR(sale_date, 'Mon YYYY') as label";
  }

  const { rows } = await query(
    `SELECT ${groupBy},
            SUM(total_amount) as revenue,
            COUNT(*) as count,
            SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END) as cash,
            SUM(CASE WHEN payment_method='upi'  THEN total_amount ELSE 0 END) as upi,
            SUM(CASE WHEN payment_method='card' THEN total_amount ELSE 0 END) as card
       FROM sales_entries
      WHERE tenant_id = $1
        AND sale_date >= CURRENT_DATE - ${interval}
      GROUP BY label, sale_date
      ORDER BY sale_date ASC`,
    [tenantId]
  );

  return R.ok(res, rows);
}

// ─── DELETE /api/sales/:id ────────────────────────────────────────────────────
export async function deleteSale(req, res) {
  const { tenantId, role } = req.user;
  const { id } = req.params;

  if (!['owner', 'manager'].includes(role)) {
    return R.forbidden(res, 'Insufficient permissions');
  }

  const { rows } = await query(
    'DELETE FROM sales_entries WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Sale entry not found');
  return R.ok(res, { id: rows[0].id });
}
