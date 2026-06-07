import { query } from '../config/database.js';
import * as R from '../utils/response.js';

export async function getNotifications(req, res) {
  const { tenantId, id: userId } = req.user;
  const { unread_only } = req.query;

  const { rows } = await query(
    `SELECT * FROM notifications
      WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)
        ${unread_only === 'true' ? 'AND is_read = FALSE' : ''}
      ORDER BY created_at DESC
      LIMIT 50`,
    [tenantId, userId]
  );

  const unreadCount = rows.filter(n => !n.is_read).length;
  return R.ok(res, { notifications: rows, unreadCount });
}

export async function markAsRead(req, res) {
  const { tenantId, id: userId } = req.user;
  const { id } = req.params;

  if (id === 'all') {
    await query(
      'UPDATE notifications SET is_read = TRUE WHERE tenant_id=$1 AND (user_id=$2 OR user_id IS NULL)',
      [tenantId, userId]
    );
    return R.ok(res, {}, 'All notifications marked as read');
  }

  await query(
    'UPDATE notifications SET is_read = TRUE WHERE id=$1 AND tenant_id=$2',
    [id, tenantId]
  );
  return R.ok(res, {});
}
