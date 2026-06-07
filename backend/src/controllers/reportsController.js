import { query } from '../config/database.js';
import * as R from '../utils/response.js';

// ─── GET /api/reports/dashboard ───────────────────────────────────────────────
export async function getDashboardStats(req, res) {
  const { tenantId } = req.user;
  const today = new Date().toISOString().split('T')[0];

  const [todayRes, weekRes, monthRes, ordersRes, topProductsRes, lowStockRes, recentOrdersRes] =
    await Promise.all([
      // Today's sales
      query(
        `SELECT COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as sales_count
           FROM sales_entries WHERE tenant_id=$1 AND sale_date=$2`,
        [tenantId, today]
      ),
      // This week
      query(
        `SELECT COALESCE(SUM(total_amount),0) as revenue
           FROM sales_entries WHERE tenant_id=$1 AND sale_date >= CURRENT_DATE - INTERVAL '7 days'`,
        [tenantId]
      ),
      // This month
      query(
        `SELECT COALESCE(SUM(total_amount),0) as revenue
           FROM sales_entries WHERE tenant_id=$1
             AND DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE)`,
        [tenantId]
      ),
      // Order counts by status
      query(
        `SELECT status, COUNT(*) as count
           FROM orders WHERE tenant_id=$1 AND DATE(created_at)=$2
           GROUP BY status`,
        [tenantId, today]
      ),
      // Top 5 products this week
      query(
        `SELECT item_name, SUM(qty) as total_qty, SUM(total_amount) as total_revenue
           FROM sales_entries WHERE tenant_id=$1 AND sale_date >= CURRENT_DATE - INTERVAL '7 days'
           GROUP BY item_name ORDER BY total_revenue DESC LIMIT 5`,
        [tenantId]
      ),
      // Low stock items
      query(
        `SELECT id, name, qty, reorder_at, unit
           FROM inventory_items WHERE tenant_id=$1 AND is_active=TRUE AND qty <= reorder_at
           ORDER BY qty ASC LIMIT 5`,
        [tenantId]
      ),
      // Recent 5 orders
      query(
        `SELECT o.id, o.order_number, o.customer_name, o.status,
                o.total_amount, o.created_at
           FROM orders o WHERE o.tenant_id=$1
           ORDER BY o.created_at DESC LIMIT 5`,
        [tenantId]
      ),
    ]);

  const orderStatusMap = Object.fromEntries(
    ordersRes.rows.map(r => [r.status, parseInt(r.count)])
  );

  // Revenue trend last 7 days
  const { rows: trend } = await query(
    `SELECT TO_CHAR(sale_date, 'Dy') as day, sale_date,
            COALESCE(SUM(total_amount),0) as revenue
       FROM sales_entries
      WHERE tenant_id = $1 AND sale_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY sale_date ORDER BY sale_date ASC`,
    [tenantId]
  );

  return R.ok(res, {
    today: {
      revenue:    parseFloat(todayRes.rows[0].revenue),
      salesCount: parseInt(todayRes.rows[0].sales_count),
      orders:     orderStatusMap,
    },
    week:  { revenue: parseFloat(weekRes.rows[0].revenue) },
    month: { revenue: parseFloat(monthRes.rows[0].revenue) },
    revenueTrend:  trend,
    topProducts:   topProductsRes.rows,
    lowStockItems: lowStockRes.rows,
    recentOrders:  recentOrdersRes.rows,
  });
}

// ─── GET /api/reports/daily ───────────────────────────────────────────────────
export async function getDailyReport(req, res) {
  const { tenantId } = req.user;
  const { date = new Date().toISOString().split('T')[0] } = req.query;

  const [salesRes, ordersRes, paymentRes] = await Promise.all([
    query(
      `SELECT item_name, SUM(qty) as qty, SUM(total_amount) as revenue,
              payment_method
         FROM sales_entries WHERE tenant_id=$1 AND sale_date=$2
         GROUP BY item_name, payment_method
         ORDER BY revenue DESC`,
      [tenantId, date]
    ),
    query(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount),0) as value
         FROM orders WHERE tenant_id=$1 AND DATE(created_at)=$2
         GROUP BY status`,
      [tenantId, date]
    ),
    query(
      `SELECT payment_method, COALESCE(SUM(total_amount),0) as total, COUNT(*) as count
         FROM sales_entries WHERE tenant_id=$1 AND sale_date=$2
         GROUP BY payment_method`,
      [tenantId, date]
    ),
  ]);

  const totalRevenue = salesRes.rows.reduce((s, r) => s + parseFloat(r.revenue), 0);

  return R.ok(res, {
    date,
    totalRevenue,
    salesByProduct: salesRes.rows,
    orderSummary:   ordersRes.rows,
    paymentBreakdown: paymentRes.rows,
  });
}

// ─── GET /api/reports/monthly ─────────────────────────────────────────────────
export async function getMonthlyReport(req, res) {
  const { tenantId } = req.user;
  const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;

  const [dailyRes, productRes, paymentRes] = await Promise.all([
    query(
      `SELECT TO_CHAR(sale_date, 'YYYY-MM-DD') as date,
              SUM(total_amount) as revenue, COUNT(*) as count
         FROM sales_entries
        WHERE tenant_id=$1
          AND EXTRACT(YEAR  FROM sale_date) = $2
          AND EXTRACT(MONTH FROM sale_date) = $3
        GROUP BY sale_date ORDER BY sale_date ASC`,
      [tenantId, year, month]
    ),
    query(
      `SELECT item_name, SUM(qty) as qty, SUM(total_amount) as revenue
         FROM sales_entries
        WHERE tenant_id=$1
          AND EXTRACT(YEAR  FROM sale_date) = $2
          AND EXTRACT(MONTH FROM sale_date) = $3
        GROUP BY item_name ORDER BY revenue DESC LIMIT 10`,
      [tenantId, year, month]
    ),
    query(
      `SELECT payment_method, SUM(total_amount) as total
         FROM sales_entries
        WHERE tenant_id=$1
          AND EXTRACT(YEAR  FROM sale_date) = $2
          AND EXTRACT(MONTH FROM sale_date) = $3
        GROUP BY payment_method`,
      [tenantId, year, month]
    ),
  ]);

  const totalRevenue = dailyRes.rows.reduce((s, r) => s + parseFloat(r.revenue), 0);

  return R.ok(res, { year, month, totalRevenue, dailyTrend: dailyRes.rows, topProducts: productRes.rows, paymentBreakdown: paymentRes.rows });
}

// ─── GET /api/reports/profit ──────────────────────────────────────────────────
export async function getProfitReport(req, res) {
  const { tenantId } = req.user;
  const { from, to } = req.query;

  const startDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const endDate   = to   || new Date().toISOString().split('T')[0];

  const { rows } = await query(
    `SELECT
       s.item_name,
       SUM(s.qty) as qty_sold,
       SUM(s.total_amount) as revenue,
       COALESCE(SUM(s.qty * i.cost_price), 0) as cost,
       SUM(s.total_amount) - COALESCE(SUM(s.qty * i.cost_price), 0) as profit
     FROM sales_entries s
     LEFT JOIN inventory_items i ON i.name = s.item_name AND i.tenant_id = s.tenant_id
    WHERE s.tenant_id = $1 AND s.sale_date BETWEEN $2 AND $3
    GROUP BY s.item_name
    ORDER BY profit DESC`,
    [tenantId, startDate, endDate]
  );

  const totals = rows.reduce((acc, r) => ({
    revenue: acc.revenue + parseFloat(r.revenue),
    cost:    acc.cost    + parseFloat(r.cost),
    profit:  acc.profit  + parseFloat(r.profit),
  }), { revenue: 0, cost: 0, profit: 0 });

  return R.ok(res, { from: startDate, to: endDate, items: rows, totals });
}

// ─── GET /api/reports/inventory ───────────────────────────────────────────────
export async function getInventoryReport(req, res) {
  const { tenantId } = req.user;

  const [itemsRes, movementsRes] = await Promise.all([
    query(
      `SELECT *, (qty * cost_price) as stock_value
         FROM inventory_items
        WHERE tenant_id = $1 AND is_active = TRUE
        ORDER BY qty ASC`,
      [tenantId]
    ),
    query(
      `SELECT sm.type, COUNT(*) as count, SUM(sm.qty) as total_qty
         FROM stock_movements sm
        WHERE sm.tenant_id = $1 AND sm.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY sm.type`,
      [tenantId]
    ),
  ]);

  const totalStockValue = itemsRes.rows.reduce((s, r) => s + parseFloat(r.stock_value || 0), 0);
  const lowStockItems   = itemsRes.rows.filter(r => parseFloat(r.qty) <= parseFloat(r.reorder_at));

  return R.ok(res, {
    items: itemsRes.rows,
    totalStockValue,
    lowStockCount: lowStockItems.length,
    movementSummary: movementsRes.rows,
  });
}
