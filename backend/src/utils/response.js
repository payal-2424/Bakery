// Standard API response helpers

export const ok = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

export const created = (res, data = {}, message = 'Created') => {
  return ok(res, data, message, 201);
};

export const noContent = (res) => {
  return res.status(204).send();
};

export const badRequest = (res, message = 'Bad request', errors = null) => {
  return res.status(400).json({ success: false, message, ...(errors && { errors }) });
};

export const unauthorized = (res, message = 'Unauthorized') => {
  return res.status(401).json({ success: false, message });
};

export const forbidden = (res, message = 'Forbidden') => {
  return res.status(403).json({ success: false, message });
};

export const notFound = (res, message = 'Not found') => {
  return res.status(404).json({ success: false, message });
};

export const conflict = (res, message = 'Conflict') => {
  return res.status(409).json({ success: false, message });
};

export const serverError = (res, message = 'Internal server error') => {
  return res.status(500).json({ success: false, message });
};

// Pagination helper
export const paginate = (page = 1, limit = 20) => {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, Math.max(1, parseInt(limit)));
  return { offset: (p - 1) * l, limit: l, page: p };
};

export const paginatedResponse = (res, data, total, page, limit) => {
  return res.json({
    success: true,
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    },
  });
};
