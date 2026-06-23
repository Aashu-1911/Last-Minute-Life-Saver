/**
 * Custom error class that carries an HTTP status code.
 * Used throughout the service layer to signal HTTP-appropriate errors
 * without coupling services to Express.
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
