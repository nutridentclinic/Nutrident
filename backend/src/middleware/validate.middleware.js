const { validationResult } = require('express-validator');
const { fail } = require('../utils/response');

// Runs after express-validator chains; short-circuits with 422 if any failed
module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, 422, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  }
  next();
};