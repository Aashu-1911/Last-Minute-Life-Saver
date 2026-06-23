/**
 * Wraps an async Express route handler and forwards any rejected promise to next(err).
 * @param {Function} fn - Async Express handler (req, res, next)
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
