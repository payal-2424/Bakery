import logger from '../utils/logger.js';

// Catch async errors without try/catch in every controller
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

// Global error handler
export function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    message: err.message,
    stack:   err.stack,
    url:     req.originalUrl,
    method:  req.method,
    user:    req.user?.id,
    tenant:  req.user?.tenantId,
  });

  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists',
      field:   err.constraint,
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist',
    });
  }

  // PostgreSQL not null violation
  if (err.code === '23502') {
    return res.status(400).json({
      success: false,
      message: `Field "${err.column}" is required`,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(400).json({ success: false, message: err.message, errors: err.errors });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({ success: false, message });
}
