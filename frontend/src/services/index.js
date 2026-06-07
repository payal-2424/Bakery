import api from './api';

// ─── Auth ──────────────────────────────────────────────────────────────────
export const authService = {
  sendOTP: (phone) => api.post('/auth/otp/send', { phone }),
  me:      ()      => api.get('/auth/me'),
};

// ─── Orders ───────────────────────────────────────────────────────────────
export const ordersService = {
  getAll:        (params)   => api.get('/orders', { params }),
  getById:       (id)       => api.get(`/orders/${id}`),
  create:        (data)     => api.post('/orders', data),
  update:        (id, data) => api.put(`/orders/${id}`, data),
  updateStatus:  (id, status, notes) => api.patch(`/orders/${id}/status`, { status, notes }),
  delete:        (id)       => api.delete(`/orders/${id}`),
};

// ─── Inventory ────────────────────────────────────────────────────────────
export const inventoryService = {
  getAll:      (params)         => api.get('/inventory', { params }),
  getById:     (id)             => api.get(`/inventory/${id}`),
  getCategories: ()             => api.get('/inventory/categories'),
  create:      (data)           => api.post('/inventory', data),
  update:      (id, data)       => api.put(`/inventory/${id}`, data),
  adjustStock: (id, data)       => api.post(`/inventory/${id}/adjust`, data),
  delete:      (id)             => api.delete(`/inventory/${id}`),
};

// ─── Sales ────────────────────────────────────────────────────────────────
export const salesService = {
  getAll:     (params) => api.get('/sales', { params }),
  getSummary: (period) => api.get('/sales/summary', { params: { period } }),
  create:     (data)   => api.post('/sales', data),
  delete:     (id)     => api.delete(`/sales/${id}`),
};

// ─── Customers ────────────────────────────────────────────────────────────
export const customersService = {
  getAll:           (params) => api.get('/customers', { params }),
  getById:          (id)     => api.get(`/customers/${id}`),
  getUpcomingBdays: (days)   => api.get('/customers/birthdays/upcoming', { params: { days } }),
  create:           (data)   => api.post('/customers', data),
  update:           (id, d)  => api.put(`/customers/${id}`, d),
  delete:           (id)     => api.delete(`/customers/${id}`),
  adjustPoints:     (id, d)  => api.post(`/customers/${id}/loyalty`, d),
};

// ─── Billing ──────────────────────────────────────────────────────────────
export const billingService = {
  getAll:    (params) => api.get('/billing/invoices', { params }),
  create:    (data)   => api.post('/billing/invoices', data),
  getPDF:    (id)     => api.get(`/billing/invoices/${id}/pdf`, { responseType: 'blob' }),
  delete:    (id)     => api.delete(`/billing/invoices/${id}`),
};

// ─── Reports ──────────────────────────────────────────────────────────────
export const reportsService = {
  getDashboard:  ()       => api.get('/reports/dashboard'),
  getDaily:      (date)   => api.get('/reports/daily',     { params: { date } }),
  getMonthly:    (y, m)   => api.get('/reports/monthly',   { params: { year: y, month: m } }),
  getProfit:     (params) => api.get('/reports/profit',    { params }),
  getInventory:  ()       => api.get('/reports/inventory'),
};

// ─── WhatsApp ─────────────────────────────────────────────────────────────
export const whatsappService = {
  getConfig:     ()       => api.get('/whatsapp/config'),
  saveConfig:    (data)   => api.post('/whatsapp/config', data),
  sendBroadcast: (data)   => api.post('/whatsapp/broadcast', data),
};

// ─── Notifications ────────────────────────────────────────────────────────
export const notificationsService = {
  getAll:    (params) => api.get('/notifications', { params }),
  markRead:  (id)     => api.patch(`/notifications/${id}/read`),
  markAllRead: ()     => api.patch('/notifications/all/read'),
};
