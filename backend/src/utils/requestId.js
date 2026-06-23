/**
 * Generates an 8-character random hex string for request correlation.
 * @returns {string}
 */
const generateRequestId = () =>
  Math.random().toString(16).slice(2, 10).padEnd(8, '0');

/**
 * Express middleware that attaches a unique requestId to every request.
 */
const attachRequestId = (req, res, next) => {
  req.requestId = generateRequestId();
  next();
};

module.exports = { generateRequestId, attachRequestId };
