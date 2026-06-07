import { query } from '../config/database.js';
import logger from '../utils/logger.js';

export function auditLog(action, entity) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async function (body) {
      // Only log successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        try {
          await query(
            `INSERT INTO audit_logs(tenant_id, user_id, action, entity, entity_id, new_data, ip_address, user_agent)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              req.user.tenantId,
              req.user.id,
              action,
              entity,
              body?.data?.id || req.params?.id || null,
              body?.data ? JSON.stringify(body.data) : null,
              req.ip,
              req.get('User-Agent'),
            ]
          );
        } catch (err) {
          // Non-critical — don't block response
          logger.error('Audit log error', { error: err.message });
        }
      }
      return originalJson(body);
    };

    next();
  };
}
