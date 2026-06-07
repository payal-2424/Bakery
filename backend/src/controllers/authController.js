import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database.js';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt.js';
import { generateOTP, sendOTP } from '../utils/otp.js';
import * as R from '../utils/response.js';
import logger from '../utils/logger.js';

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
export async function signup(req, res) {
  const { bakeryName, ownerName, phone, email, password, city, state } = req.body;

  // Build slug from bakery name
  const slug = bakeryName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);

  try {
    const result = await withTransaction(async (client) => {
      // Check phone uniqueness globally (a user can only own one bakery per phone)
      const existing = await client.query(
        'SELECT id FROM users WHERE phone = $1',
        [phone]
      );
      if (existing.rows.length) {
        throw Object.assign(new Error('Phone number already registered'), { statusCode: 409 });
      }

      // Ensure slug uniqueness
      const slugCheck = await client.query(
        'SELECT id FROM tenants WHERE slug = $1', [slug]
      );
      const finalSlug = slugCheck.rows.length
        ? `${slug}-${Date.now().toString().slice(-4)}`
        : slug;

      // Create tenant
      const tenantRes = await client.query(
        `INSERT INTO tenants(name, slug, phone, email, city, state)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [bakeryName, finalSlug, phone, email || null, city || null, state || null]
      );
      const tenantId = tenantRes.rows[0].id;

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create owner user
      const userRes = await client.query(
        `INSERT INTO users(tenant_id, name, phone, email, password_hash, role)
         VALUES($1,$2,$3,$4,$5,'owner')
         RETURNING id, tenant_id, name, phone, email, role`,
        [tenantId, ownerName, phone, email || null, passwordHash]
      );

      return { user: userRes.rows[0], tenantId };
    });

    const { accessToken, refreshToken } = generateTokenPair(result.user);

    // Store refresh token
    await query(
      `INSERT INTO refresh_tokens(user_id, token, expires_at)
       VALUES($1,$2, NOW() + INTERVAL '30 days')`,
      [result.user.id, refreshToken]
    );

    return R.created(res, {
      accessToken,
      refreshToken,
      user: {
        id:       result.user.id,
        name:     result.user.name,
        phone:    result.user.phone,
        email:    result.user.email,
        role:     result.user.role,
        tenantId: result.user.tenant_id,
      },
    }, 'Account created successfully');
  } catch (err) {
    if (err.statusCode) throw err;
    logger.error('Signup error', { error: err.message });
    throw err;
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export async function login(req, res) {
  const { phone, password, tenantSlug } = req.body;

  let userQuery = `
    SELECT u.id, u.tenant_id, u.name, u.phone, u.email, u.role,
           u.password_hash, u.is_active, t.slug, t.name as bakery_name, t.is_active as tenant_active
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
     WHERE u.phone = $1`;
  const params = [phone];

  if (tenantSlug) {
    userQuery += ' AND t.slug = $2';
    params.push(tenantSlug);
  }

  const { rows } = await query(userQuery, params);

  if (!rows[0]) {
    return R.unauthorized(res, 'Invalid phone or password');
  }

  const user = rows[0];

  if (!user.is_active) {
    return R.unauthorized(res, 'Account disabled. Contact your owner.');
  }

  if (!user.tenant_active) {
    return R.unauthorized(res, 'Bakery account suspended. Contact support.');
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    return R.unauthorized(res, 'Invalid phone or password');
  }

  const { accessToken, refreshToken } = generateTokenPair(user);

  await query(
    `INSERT INTO refresh_tokens(user_id, token, expires_at)
     VALUES($1,$2, NOW() + INTERVAL '30 days')`,
    [user.id, refreshToken]
  );

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  return R.ok(res, {
    accessToken,
    refreshToken,
    user: {
      id:          user.id,
      name:        user.name,
      phone:       user.phone,
      email:       user.email,
      role:        user.role,
      tenantId:    user.tenant_id,
      bakeryName:  user.bakery_name,
    },
  }, 'Login successful');
}

// ─── POST /api/auth/otp/send ──────────────────────────────────────────────────
export async function sendOTPHandler(req, res) {
  const { phone } = req.body;

  const { rows } = await query(
    `SELECT u.id, u.name, u.is_active, t.is_active as tenant_active
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.phone = $1`,
    [phone]
  );

  // Always return success (don't reveal if phone exists)
  if (!rows[0] || !rows[0].is_active) {
    return R.ok(res, {}, 'If this number is registered, an OTP has been sent');
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await query(
    'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
    [otp, expiresAt, rows[0].id]
  );

  await sendOTP(phone, otp);

  return R.ok(res, {}, 'OTP sent successfully');
}

// ─── POST /api/auth/otp/verify ────────────────────────────────────────────────
export async function verifyOTPHandler(req, res) {
  const { phone, otp } = req.body;

  const { rows } = await query(
    `SELECT u.id, u.tenant_id, u.name, u.phone, u.email, u.role,
            u.otp_code, u.otp_expires_at, u.is_active,
            t.name as bakery_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.phone = $1`,
    [phone]
  );

  if (!rows[0]) return R.unauthorized(res, 'Invalid OTP');

  const user = rows[0];

  if (!user.is_active) return R.unauthorized(res, 'Account disabled');

  if (user.otp_code !== otp) return R.unauthorized(res, 'Invalid OTP');

  if (new Date() > new Date(user.otp_expires_at)) {
    return R.unauthorized(res, 'OTP expired. Please request a new one.');
  }

  // Clear OTP
  await query(
    'UPDATE users SET otp_code = NULL, otp_expires_at = NULL, last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  const { accessToken, refreshToken } = generateTokenPair(user);

  await query(
    `INSERT INTO refresh_tokens(user_id, token, expires_at)
     VALUES($1,$2, NOW() + INTERVAL '30 days')`,
    [user.id, refreshToken]
  );

  return R.ok(res, {
    accessToken,
    refreshToken,
    user: {
      id: user.id, name: user.name, phone: user.phone,
      email: user.email, role: user.role,
      tenantId: user.tenant_id, bakeryName: user.bakery_name,
    },
  }, 'OTP verified');
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
export async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return R.badRequest(res, 'Refresh token required');

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    return R.unauthorized(res, 'Invalid or expired refresh token');
  }

  // Check token exists in DB and not expired
  const { rows } = await query(
    `SELECT rt.id, u.id as user_id, u.tenant_id, u.name, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
      WHERE rt.token = $1 AND rt.expires_at > NOW()`,
    [refreshToken]
  );

  if (!rows[0] || !rows[0].is_active) {
    return R.unauthorized(res, 'Token revoked or user inactive');
  }

  const user = rows[0];
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);

  // Rotate refresh token
  await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  await query(
    `INSERT INTO refresh_tokens(user_id, token, expires_at)
     VALUES($1,$2, NOW() + INTERVAL '30 days')`,
    [user.user_id, newRefreshToken]
  );

  return R.ok(res, { accessToken, refreshToken: newRefreshToken });
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
export async function logout(req, res) {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  }
  return R.ok(res, {}, 'Logged out successfully');
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
export async function me(req, res) {
  const { rows } = await query(
    `SELECT u.id, u.tenant_id, u.name, u.phone, u.email, u.role,
            t.name as bakery_name, t.slug, t.logo_url, t.plan, t.gstin,
            t.city, t.address, t.settings
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1`,
    [req.user.id]
  );

  if (!rows[0]) return R.notFound(res, 'User not found');

  return R.ok(res, rows[0]);
}
