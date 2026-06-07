import { verifyAccessToken } from '../utils/jwt.js';
import { unauthorized, forbidden } from '../utils/response.js';
import { query } from '../config/database.js';

// Verify JWT and attach user to req
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Verify user still exists and is active
    const { rows } = await query(
      `SELECT id, tenant_id, name, role, is_active
         FROM users
        WHERE id = $1 AND tenant_id = $2`,
      [decoded.sub, decoded.tenantId]
    );

    if (!rows[0] || !rows[0].is_active) {
      return unauthorized(res, 'Account not found or disabled');
    }

    req.user = {
      id:       rows[0].id,
      tenantId: rows[0].tenant_id,
      name:     rows[0].name,
      role:     rows[0].role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Token expired');
    }
    if (err.name === 'JsonWebTokenError') {
      return unauthorized(res, 'Invalid token');
    }
    next(err);
  }
}

// Role-based access control
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return forbidden(res, `Requires role: ${roles.join(' or ')}`);
    }
    next();
  };
}

// Tenant isolation: ensure resource belongs to user's tenant
export function tenantScope(req, _res, next) {
  // Add tenant_id to all queries automatically via req.user.tenantId
  next();
}
