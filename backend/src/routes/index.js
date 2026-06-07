import { Router } from 'express';
import { body, param, query as qv } from 'express-validator';
import rateLimit from 'express-rate-limit';

import * as auth         from '../controllers/authController.js';
import * as orders       from '../controllers/ordersController.js';
import * as inventory    from '../controllers/inventoryController.js';
import * as sales        from '../controllers/salesController.js';
import * as customers    from '../controllers/customersController.js';
import * as billing      from '../controllers/billingController.js';
import * as reports      from '../controllers/reportsController.js';
import * as whatsapp     from '../controllers/whatsappController.js';
import * as notifications from '../controllers/notificationsController.js';

import { authenticate, requireRole } from '../middleware/auth.js';
import { validate }                  from '../middleware/validate.js';
import { asyncHandler }              from '../middleware/errorHandler.js';
import { auditLog }                  from '../middleware/auditLog.js';

const router = Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts' });
const otpLimiter  = rateLimit({ windowMs: 60 * 1000,      max: 3,  message: 'Too many OTP requests' });

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
router.post('/auth/signup',
  authLimiter,
  [
    body('bakeryName').trim().notEmpty().isLength({ max: 200 }),
    body('ownerName').trim().notEmpty(),
    body('phone').trim().matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian mobile number'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 characters'),
  ],
  validate,
  asyncHandler(auth.signup)
);

router.post('/auth/login',
  authLimiter,
  [
    body('phone').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  validate,
  asyncHandler(auth.login)
);

router.post('/auth/otp/send',  otpLimiter, asyncHandler(auth.sendOTPHandler));
router.post('/auth/otp/verify', asyncHandler(auth.verifyOTPHandler));
router.post('/auth/refresh',    asyncHandler(auth.refresh));
router.post('/auth/logout',     asyncHandler(auth.logout));
router.get('/auth/me',  authenticate, asyncHandler(auth.me));

// ═══════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════
router.get   ('/orders',          authenticate, asyncHandler(orders.getOrders));
router.get   ('/orders/:id',      authenticate, asyncHandler(orders.getOrder));
router.post  ('/orders',
  authenticate,
  [
    body('customerName').trim().notEmpty(),
    body('customerPhone').trim().notEmpty(),
    body('items').isArray({ min: 1 }),
    body('items.*.itemName').notEmpty(),
    body('items.*.qty').isFloat({ min: 0.1 }),
  ],
  validate,
  auditLog('CREATE_ORDER', 'orders'),
  asyncHandler(orders.createOrder)
);
router.patch ('/orders/:id/status',
  authenticate,
  [body('status').notEmpty()],
  validate,
  auditLog('UPDATE_ORDER_STATUS', 'orders'),
  asyncHandler(orders.updateOrderStatus)
);
router.put   ('/orders/:id',      authenticate, auditLog('UPDATE_ORDER', 'orders'), asyncHandler(orders.updateOrder));
router.delete('/orders/:id',      authenticate, requireRole('owner','manager'), asyncHandler(orders.deleteOrder));

// ═══════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════
router.get   ('/inventory',                authenticate, asyncHandler(inventory.getItems));
router.get   ('/inventory/categories',     authenticate, asyncHandler(inventory.getCategories));
router.get   ('/inventory/:id',            authenticate, asyncHandler(inventory.getItem));
router.post  ('/inventory',
  authenticate,
  requireRole('owner', 'manager'),
  [body('name').trim().notEmpty()],
  validate,
  asyncHandler(inventory.createItem)
);
router.put   ('/inventory/:id',            authenticate, requireRole('owner','manager'), asyncHandler(inventory.updateItem));
router.post  ('/inventory/:id/adjust',
  authenticate,
  [
    body('type').isIn(['in','out','adjustment']),
    body('qty').isFloat({ min: 0.01 }),
  ],
  validate,
  auditLog('STOCK_ADJUST', 'inventory'),
  asyncHandler(inventory.adjustStock)
);
router.delete('/inventory/:id',            authenticate, requireRole('owner','manager'), asyncHandler(inventory.deleteItem));

// ═══════════════════════════════════════════════════════════
// SALES
// ═══════════════════════════════════════════════════════════
router.get   ('/sales',          authenticate, asyncHandler(sales.getSales));
router.get   ('/sales/summary',  authenticate, asyncHandler(sales.getSalesSummary));
router.post  ('/sales',
  authenticate,
  [
    body('itemName').notEmpty(),
    body('qty').isFloat({ min: 0.1 }),
    body('unitPrice').isFloat({ min: 0 }),
    body('paymentMethod').isIn(['cash','upi','card']),
  ],
  validate,
  asyncHandler(sales.createSale)
);
router.delete('/sales/:id',      authenticate, requireRole('owner','manager'), asyncHandler(sales.deleteSale));

// ═══════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════
router.get   ('/customers',                    authenticate, asyncHandler(customers.getCustomers));
router.get   ('/customers/birthdays/upcoming', authenticate, asyncHandler(customers.getUpcomingBirthdays));
router.get   ('/customers/:id',                authenticate, asyncHandler(customers.getCustomer));
router.post  ('/customers',
  authenticate,
  [
    body('name').trim().notEmpty(),
    body('phone').trim().notEmpty(),
  ],
  validate,
  asyncHandler(customers.createCustomer)
);
router.put   ('/customers/:id',         authenticate, asyncHandler(customers.updateCustomer));
router.delete('/customers/:id',         authenticate, requireRole('owner'), asyncHandler(customers.deleteCustomer));
router.post  ('/customers/:id/loyalty', authenticate, requireRole('owner','manager'), asyncHandler(customers.adjustLoyaltyPoints));

// ═══════════════════════════════════════════════════════════
// BILLING
// ═══════════════════════════════════════════════════════════
router.get   ('/billing/invoices',          authenticate, asyncHandler(billing.getInvoices));
router.post  ('/billing/invoices',          authenticate, requireRole('owner','manager'), asyncHandler(billing.createInvoice));
router.get   ('/billing/invoices/:id/pdf',  authenticate, asyncHandler(billing.downloadInvoicePDF));
router.delete('/billing/invoices/:id',      authenticate, requireRole('owner'), asyncHandler(billing.deleteInvoice));

// ═══════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════
router.get('/reports/dashboard', authenticate, asyncHandler(reports.getDashboardStats));
router.get('/reports/daily',     authenticate, asyncHandler(reports.getDailyReport));
router.get('/reports/monthly',   authenticate, asyncHandler(reports.getMonthlyReport));
router.get('/reports/profit',    authenticate, requireRole('owner','manager'), asyncHandler(reports.getProfitReport));
router.get('/reports/inventory', authenticate, asyncHandler(reports.getInventoryReport));

// ═══════════════════════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════════════════════
router.get ('/whatsapp/webhook',   whatsapp.verifyWebhook); // no auth — Meta verification
router.post('/whatsapp/webhook',   whatsapp.receiveWebhook); // no auth — Meta callback
router.get ('/whatsapp/config',    authenticate, requireRole('owner'), asyncHandler(whatsapp.getConfig));
router.post('/whatsapp/config',    authenticate, requireRole('owner'), asyncHandler(whatsapp.saveConfig));
router.post('/whatsapp/broadcast', authenticate, requireRole('owner','manager'), asyncHandler(whatsapp.sendBroadcast));

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
router.get  ('/notifications',        authenticate, asyncHandler(notifications.getNotifications));
router.patch('/notifications/:id/read', authenticate, asyncHandler(notifications.markAsRead));

export default router;
