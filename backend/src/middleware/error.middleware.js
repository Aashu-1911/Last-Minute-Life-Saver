const logger = require('../config/logger');

/**
 * Centralized Express error handler.
 * Must be mounted last (4-argument signature).
 */
// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error({
    message: err.message,
    stack: err.stack,
    requestId: req.requestId,
  });

  const body = { success: false, error: err.message };
  if (!isProduction) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

module.exports = { errorMiddleware };
