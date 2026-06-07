import { query } from '../config/database.js';
import * as R from '../utils/response.js';

// ─── GET /api/customers ───────────────────────────────────────────────────────
export async function getCustomers(req, res) {
  const { tenantId } = req.user;
  const { search, page = 1, limit = 20 } = req.query;
  const { offset, limit: lim } = R.paginate(page, limit);

  const conditions = ['tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');

  const [cRes, countRes] = await Promise.all([
    query(
      `SELECT * FROM customers WHERE ${where}
       ORDER BY total_spent DESC, created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, lim, offset]
    ),
    query(`SELECT COUNT(*) FROM customers WHERE ${where}`, params),
  ]);

  return R.paginatedResponse(res, cRes.rows, parseInt(countRes.rows[0].count), page, lim);
}

// ─── GET /api/customers/:id ───────────────────────────────────────────────────
export async function getCustomer(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;

  const [cRes, ordersRes] = await Promise.all([
    query('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [id, tenantId]),
    query(
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
              json_agg(json_build_object('name', oi.item_name, 'qty', oi.qty)) as items
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT 20`,
      [id]
    ),
  ]);

  if (!cRes.rows[0]) return R.notFound(res, 'Customer not found');

  return R.ok(res, { ...cRes.rows[0], orders: ordersRes.rows });
}

// ─── POST /api/customers ──────────────────────────────────────────────────────
export async function createCustomer(req, res) {
  const { tenantId } = req.user;
  const { name, phone, email, address, birthday, anniversary, notes, tags } = req.body;

  // Check phone uniqueness within tenant
  const existing = await query(
    'SELECT id FROM customers WHERE phone = $1 AND tenant_id = $2',
    [phone, tenantId]
  );
  if (existing.rows[0]) {
    return R.conflict(res, 'Customer with this phone already exists');
  }

  const { rows } = await query(
    `INSERT INTO customers(tenant_id, name, phone, email, address, birthday, anniversary, notes, tags)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      tenantId, name, phone, email || null,
      address || null, birthday || null, anniversary || null,
      notes || null, tags || [],
    ]
  );

  return R.created(res, rows[0]);
}

// ─── PUT /api/customers/:id ───────────────────────────────────────────────────
export async function updateCustomer(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { name, phone, email, address, birthday, anniversary, notes, tags } = req.body;

  const { rows } = await query(
    `UPDATE customers
        SET name        = COALESCE($1, name),
            phone       = COALESCE($2, phone),
            email       = COALESCE($3, email),
            address     = COALESCE($4, address),
            birthday    = COALESCE($5, birthday),
            anniversary = COALESCE($6, anniversary),
            notes       = COALESCE($7, notes),
            tags        = COALESCE($8, tags),
            updated_at  = NOW()
      WHERE id = $9 AND tenant_id = $10
      RETURNING *`,
    [name, phone, email, address, birthday, anniversary, notes, tags, id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Customer not found');
  return R.ok(res, rows[0]);
}

// ─── DELETE /api/customers/:id ────────────────────────────────────────────────
export async function deleteCustomer(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;

  const { rows } = await query(
    'DELETE FROM customers WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Customer not found');
  return R.ok(res, { id: rows[0].id });
}

// ─── GET /api/customers/birthdays/upcoming ────────────────────────────────────
export async function getUpcomingBirthdays(req, res) {
  const { tenantId } = req.user;
  const { days = 7 } = req.query;

  const { rows } = await query(
    `SELECT id, name, phone, birthday,
            DATE_PART('year', AGE(birthday)) + 1 as upcoming_age
       FROM customers
      WHERE tenant_id = $1
        AND birthday IS NOT NULL
        AND (
          DATE_PART('month', birthday) > DATE_PART('month', CURRENT_DATE)
          OR (
            DATE_PART('month', birthday) = DATE_PART('month', CURRENT_DATE)
            AND DATE_PART('day', birthday) >= DATE_PART('day', CURRENT_DATE)
          )
        )
        AND (
          (DATE_PART('month', birthday) * 100 + DATE_PART('day', birthday))
          - (DATE_PART('month', CURRENT_DATE) * 100 + DATE_PART('day', CURRENT_DATE))
          BETWEEN 0 AND $2
        )
      ORDER BY
        DATE_PART('month', birthday),
        DATE_PART('day', birthday)
      LIMIT 20`,
    [tenantId, days]
  );

  return R.ok(res, rows);
}

// ─── POST /api/customers/:id/loyalty ─────────────────────────────────────────
export async function adjustLoyaltyPoints(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { points, reason } = req.body;

  const { rows } = await query(
    `UPDATE customers
        SET loyalty_points = GREATEST(0, loyalty_points + $1), updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING id, name, loyalty_points`,
    [points, id, tenantId]
  );

  if (!rows[0]) return R.notFound(res, 'Customer not found');
  return R.ok(res, rows[0], `Points ${points > 0 ? 'added' : 'deducted'}`);
}
