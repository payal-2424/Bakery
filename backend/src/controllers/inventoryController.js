import { query, withTransaction } from '../config/database.js';
import * as R from '../utils/response.js';

// ─── GET /api/inventory ───────────────────────────────────────────────────────
export async function getItems(req, res) {
  const { tenantId } = req.user;
  const { search, category, low_stock, page = 1, limit = 50 } = req.query;
  const { offset, limit: lim } = R.paginate(page, limit);

  const conditions = ['tenant_id = $1', 'is_active = TRUE'];
  const params = [tenantId];
  let idx = 2;

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR sku ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (category) {
    conditions.push(`category = $${idx++}`);
    params.push(category);
  }
  if (low_stock === 'true') {
    conditions.push('qty <= reorder_at');
  }

  const where = conditions.join(' AND ');

  const [itemsRes, countRes] = await Promise.all([
    query(
      `SELECT * FROM inventory_items WHERE ${where}
       ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, lim, offset]
    ),
    query(`SELECT COUNT(*) FROM inventory_items WHERE ${where}`, params),
  ]);

  return R.paginatedResponse(res, itemsRes.rows, parseInt(countRes.rows[0].count), page, lim);
}

// ─── GET /api/inventory/:id ───────────────────────────────────────────────────
export async function getItem(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;

  const [itemRes, movementsRes] = await Promise.all([
    query(
      'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    ),
    query(
      `SELECT sm.*, u.name as created_by_name
         FROM stock_movements sm
         LEFT JOIN users u ON u.id = sm.created_by
        WHERE sm.item_id = $1
        ORDER BY sm.created_at DESC
        LIMIT 50`,
      [id]
    ),
  ]);

  if (!itemRes.rows[0]) return R.notFound(res, 'Item not found');

  return R.ok(res, {
    ...itemRes.rows[0],
    movements: movementsRes.rows,
  });
}

// ─── POST /api/inventory ──────────────────────────────────────────────────────
export async function createItem(req, res) {
  const { tenantId, id: userId } = req.user;
  const { name, category, unit, qty, reorderAt, costPrice, sellPrice, sku, description } = req.body;

  const result = await withTransaction(async (client) => {
    const itemRes = await client.query(
      `INSERT INTO inventory_items(
        tenant_id, name, category, unit, qty, reorder_at,
        cost_price, sell_price, sku, description
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [tenantId, name, category || null, unit || 'pcs', qty || 0,
       reorderAt || 0, costPrice || 0, sellPrice || 0, sku || null, description || null]
    );

    const item = itemRes.rows[0];

    // Record initial stock movement if qty > 0
    if (qty > 0) {
      await client.query(
        `INSERT INTO stock_movements(tenant_id, item_id, type, qty, qty_before, qty_after, notes, created_by)
         VALUES($1,$2,'in',$3,0,$3,'Initial stock',$4)`,
        [tenantId, item.id, qty, userId]
      );
    }

    return item;
  });

  // Check if low stock on creation
  if (result.qty <= result.reorder_at && result.reorder_at > 0) {
    await query(
      `INSERT INTO notifications(tenant_id, type, title, body, data)
       VALUES($1,'low_stock',$2,$3,$4)`,
      [
        tenantId, `Low Stock: ${result.name}`,
        `${result.name} was added with low stock (${result.qty} ${result.unit}).`,
        JSON.stringify({ itemId: result.id }),
      ]
    );
  }

  return R.created(res, result);
}

// ─── PUT /api/inventory/:id ───────────────────────────────────────────────────
export async function updateItem(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { name, category, unit, reorderAt, costPrice, sellPrice, sku, description } = req.body;

  const { rows } = await query(
    `UPDATE inventory_items
        SET name        = COALESCE($1, name),
            category    = COALESCE($2, category),
            unit        = COALESCE($3, unit),
            reorder_at  = COALESCE($4, reorder_at),
            cost_price  = COALESCE($5, cost_price),
            sell_price  = COALESCE($6, sell_price),
            sku         = COALESCE($7, sku),
            description = COALESCE($8, description),
            updated_at  = NOW()
      WHERE id = $9 AND tenant_id = $10
      RETURNING *`,
    [name, category, unit, reorderAt, costPrice, sellPrice, sku, description, id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Item not found');
  return R.ok(res, rows[0]);
}

// ─── POST /api/inventory/:id/adjust ──────────────────────────────────────────
export async function adjustStock(req, res) {
  const { tenantId, id: userId } = req.user;
  const { id } = req.params;
  const { type, qty, notes } = req.body;  // type: in | out | adjustment

  if (!['in', 'out', 'adjustment'].includes(type)) {
    return R.badRequest(res, 'type must be: in | out | adjustment');
  }
  if (typeof qty !== 'number' || qty <= 0) {
    return R.badRequest(res, 'qty must be a positive number');
  }

  const result = await withTransaction(async (client) => {
    const itemRes = await client.query(
      'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tenantId]
    );
    if (!itemRes.rows[0]) throw Object.assign(new Error('Item not found'), { statusCode: 404 });

    const item = itemRes.rows[0];
    const qtyBefore = parseFloat(item.qty);
    let qtyAfter;

    if (type === 'in')          qtyAfter = qtyBefore + qty;
    else if (type === 'out')    qtyAfter = Math.max(0, qtyBefore - qty);
    else                        qtyAfter = qty; // adjustment sets absolute value

    await client.query(
      'UPDATE inventory_items SET qty = $1, updated_at = NOW() WHERE id = $2',
      [qtyAfter, id]
    );

    await client.query(
      `INSERT INTO stock_movements(tenant_id, item_id, type, qty, qty_before, qty_after, notes, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, id, type, qty, qtyBefore, qtyAfter, notes || null, userId]
    );

    return { ...item, qty: qtyAfter };
  });

  // Low stock notification
  if (result.qty <= result.reorder_at) {
    await query(
      `INSERT INTO notifications(tenant_id, type, title, body, data)
       VALUES($1,'low_stock',$2,$3,$4)`,
      [
        tenantId,
        `Low Stock: ${result.name}`,
        `${result.name} is low (${result.qty} ${result.unit}). Please reorder.`,
        JSON.stringify({ itemId: id, qty: result.qty }),
      ]
    );
  }

  return R.ok(res, result, 'Stock adjusted');
}

// ─── DELETE /api/inventory/:id ────────────────────────────────────────────────
export async function deleteItem(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;

  // Soft delete
  const { rows } = await query(
    'UPDATE inventory_items SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Item not found');
  return R.ok(res, { id: rows[0].id }, 'Item removed');
}

// ─── GET /api/inventory/categories ───────────────────────────────────────────
export async function getCategories(req, res) {
  const { tenantId } = req.user;
  const { rows } = await query(
    `SELECT DISTINCT category FROM inventory_items
      WHERE tenant_id = $1 AND is_active = TRUE AND category IS NOT NULL
      ORDER BY category`,
    [tenantId]
  );
  return R.ok(res, rows.map(r => r.category));
}
