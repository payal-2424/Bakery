import { query, withTransaction } from '../config/database.js';
import * as R from '../utils/response.js';

// ─── GET /api/orders ──────────────────────────────────────────────────────────
export async function getOrders(req, res) {
  const { tenantId } = req.user;
  const { status, search, page = 1, limit = 20, from, to, source } = req.query;
  const { offset, limit: lim } = R.paginate(page, limit);

  const conditions = ['o.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (status) {
    conditions.push(`o.status = $${idx++}`);
    params.push(status);
  }
  if (source) {
    conditions.push(`o.source = $${idx++}`);
    params.push(source);
  }
  if (from) {
    conditions.push(`o.created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`o.created_at <= $${idx++}::date + INTERVAL '1 day'`);
    params.push(to);
  }
  if (search) {
    conditions.push(`(o.customer_name ILIKE $${idx} OR o.order_number ILIKE $${idx} OR o.customer_phone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');

  const [ordersRes, countRes] = await Promise.all([
    query(
      `SELECT o.*, 
              json_agg(json_build_object(
                'id', oi.id, 'item_name', oi.item_name,
                'qty', oi.qty, 'unit_price', oi.unit_price,
                'total_price', oi.total_price, 'customization', oi.customization
              ) ORDER BY oi.created_at) as items
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE ${where}
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, lim, offset]
    ),
    query(`SELECT COUNT(*) FROM orders o WHERE ${where}`, params),
  ]);

  return R.paginatedResponse(res, ordersRes.rows, parseInt(countRes.rows[0].count), page, lim);
}

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
export async function getOrder(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;

  const { rows } = await query(
    `SELECT o.*,
            json_agg(json_build_object(
              'id', oi.id, 'item_id', oi.item_id, 'item_name', oi.item_name,
              'qty', oi.qty, 'unit_price', oi.unit_price,
              'discount', oi.discount, 'total_price', oi.total_price,
              'customization', oi.customization
            ) ORDER BY oi.created_at) as items,
            (SELECT json_agg(json_build_object(
              'status', osh.status, 'notes', osh.notes,
              'created_at', osh.created_at,
              'changed_by', u.name
            ) ORDER BY osh.created_at)
             FROM order_status_history osh
             LEFT JOIN users u ON u.id = osh.changed_by
             WHERE osh.order_id = o.id
            ) as status_history
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1 AND o.tenant_id = $2
      GROUP BY o.id`,
    [id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Order not found');
  return R.ok(res, rows[0]);
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────
export async function createOrder(req, res) {
  const { tenantId, id: userId } = req.user;
  const {
    customerName, customerPhone, customerId,
    items, deliveryType = 'pickup', deliveryAddress,
    pickupDate, pickupTime, notes,
    paymentMethod, discount = 0, source = 'manual',
  } = req.body;

  if (!items?.length) return R.badRequest(res, 'Order must have at least one item');

  const result = await withTransaction(async (client) => {
    // Generate order number
    const numRes = await client.query(
      'SELECT generate_order_number($1) as num', [tenantId]
    );
    const orderNumber = numRes.rows[0].num;

    // Fetch item prices from inventory
    const itemIds = items.filter(i => i.itemId).map(i => i.itemId);
    let inventoryMap = {};
    if (itemIds.length) {
      const invRes = await client.query(
        'SELECT id, name, sell_price FROM inventory_items WHERE id = ANY($1) AND tenant_id = $2',
        [itemIds, tenantId]
      );
      inventoryMap = Object.fromEntries(invRes.rows.map(r => [r.id, r]));
    }

    // Calculate totals
    let subtotal = 0;
    const processedItems = items.map(item => {
      const inv = inventoryMap[item.itemId];
      const unitPrice = item.unitPrice ?? inv?.sell_price ?? 0;
      const totalPrice = unitPrice * item.qty - (item.discount || 0);
      subtotal += totalPrice;
      return { ...item, itemName: item.itemName || inv?.name, unitPrice, totalPrice };
    });

    const taxAmount  = parseFloat(((subtotal - discount) * 0.05).toFixed(2)); // 5% GST
    const totalAmount = subtotal - discount + taxAmount;

    // Create order
    const orderRes = await client.query(
      `INSERT INTO orders(
        tenant_id, order_number, customer_id, customer_name, customer_phone,
        status, source, delivery_type, delivery_address,
        pickup_date, pickup_time, subtotal, discount, tax_amount, total_amount,
        payment_method, notes, created_by
      ) VALUES($1,$2,$3,$4,$5,'new',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        tenantId, orderNumber, customerId || null, customerName, customerPhone,
        source, deliveryType, deliveryAddress || null,
        pickupDate || null, pickupTime || null,
        subtotal, discount, taxAmount, totalAmount,
        paymentMethod || null, notes || null, userId,
      ]
    );
    const order = orderRes.rows[0];

    // Insert order items
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO order_items(order_id, tenant_id, item_id, item_name, qty, unit_price, discount, total_price, customization)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          order.id, tenantId, item.itemId || null,
          item.itemName, item.qty, item.unitPrice,
          item.discount || 0, item.totalPrice, item.customization || null,
        ]
      );
    }

    // Initial status history entry
    await client.query(
      `INSERT INTO order_status_history(order_id, status, notes, changed_by)
       VALUES($1,'new','Order created',$2)`,
      [order.id, userId]
    );

    // Update customer stats
    if (customerId) {
      await client.query(
        `UPDATE customers
            SET total_orders = total_orders + 1, updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2`,
        [customerId, tenantId]
      );
    }

    // Create low-stock notifications for deducted items
    for (const item of processedItems) {
      if (item.itemId) {
        const stockRes = await client.query(
          'SELECT qty, reorder_at, name FROM inventory_items WHERE id = $1',
          [item.itemId]
        );
        const inv = stockRes.rows[0];
        if (inv && parseFloat(inv.qty) <= parseFloat(inv.reorder_at)) {
          await client.query(
            `INSERT INTO notifications(tenant_id, type, title, body, data)
             VALUES($1,'low_stock',$2,$3,$4)
             ON CONFLICT DO NOTHING`,
            [
              tenantId,
              `Low Stock: ${inv.name}`,
              `${inv.name} is running low (${inv.qty} remaining). Time to reorder.`,
              JSON.stringify({ itemId: item.itemId, qty: inv.qty }),
            ]
          );
        }
      }
    }

    return order;
  });

  return R.created(res, result, 'Order created successfully');
}

// ─── PATCH /api/orders/:id/status ────────────────────────────────────────────
export async function updateOrderStatus(req, res) {
  const { tenantId, id: userId } = req.user;
  const { id } = req.params;
  const { status, notes } = req.body;

  const VALID_TRANSITIONS = {
    new:       ['confirmed', 'preparing', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready:     ['delivered', 'completed', 'cancelled'],
    delivered: ['completed'],
    completed: [],
    cancelled: [],
  };

  const { rows } = await query(
    'SELECT status FROM orders WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Order not found');

  const currentStatus = rows[0].status;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(status)) {
    return R.badRequest(res, `Cannot transition from "${currentStatus}" to "${status}"`);
  }

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
    await client.query(
      `INSERT INTO order_status_history(order_id, status, notes, changed_by)
       VALUES($1,$2,$3,$4)`,
      [id, status, notes || null, userId]
    );

    // On completion, update customer total_spent
    if (status === 'completed') {
      await client.query(
        `UPDATE customers c
            SET total_spent = total_spent + o.total_amount, updated_at = NOW(),
                loyalty_points = loyalty_points + FLOOR(o.total_amount / 100)
           FROM orders o
          WHERE o.id = $1 AND c.id = o.customer_id`,
        [id]
      );
    }
  });

  const { rows: updated } = await query('SELECT * FROM orders WHERE id = $1', [id]);
  return R.ok(res, updated[0], 'Order status updated');
}

// ─── PUT /api/orders/:id ──────────────────────────────────────────────────────
export async function updateOrder(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { customerName, customerPhone, notes, pickupDate, pickupTime, paymentMethod, amountPaid, paymentStatus } = req.body;

  const { rows } = await query(
    `UPDATE orders
        SET customer_name = COALESCE($1, customer_name),
            customer_phone = COALESCE($2, customer_phone),
            notes = COALESCE($3, notes),
            pickup_date = COALESCE($4, pickup_date),
            pickup_time = COALESCE($5, pickup_time),
            payment_method = COALESCE($6, payment_method),
            amount_paid = COALESCE($7, amount_paid),
            payment_status = COALESCE($8, payment_status),
            updated_at = NOW()
      WHERE id = $9 AND tenant_id = $10
      RETURNING *`,
    [customerName, customerPhone, notes, pickupDate, pickupTime, paymentMethod, amountPaid, paymentStatus, id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Order not found');
  return R.ok(res, rows[0]);
}

// ─── DELETE /api/orders/:id ───────────────────────────────────────────────────
export async function deleteOrder(req, res) {
  const { tenantId, role } = req.user;
  const { id } = req.params;

  if (!['owner', 'manager'].includes(role)) {
    return R.forbidden(res, 'Only owners/managers can delete orders');
  }

  const { rows } = await query(
    'DELETE FROM orders WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Order not found');
  return R.ok(res, { id: rows[0].id }, 'Order deleted');
}
