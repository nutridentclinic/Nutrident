const { body } = require('express-validator');

exports.createDentistRules = [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 15 }),
  body('password').isLength({ min: 6 }),
  body('specialization').trim().notEmpty(),
  body('consultationFee').isFloat({ min: 0 }),
];