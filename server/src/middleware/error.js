import { logger } from '../lib/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? 500;
  if (status >= 500) logger.error(err.stack ?? err.message);
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(err.details ? { details: err.details } : {}),
  });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}
