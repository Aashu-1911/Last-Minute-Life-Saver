/**
 * Middleware factory that validates req.body against a Joi schema.
 * On failure, forwards a 400 error to the next error handler.
 */
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: true });
  if (error) {
    const err = new Error(error.details[0].message);
    err.statusCode = 400;
    return next(err);
  }
  next();
};

module.exports = { validate };
