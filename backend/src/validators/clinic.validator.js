const { body } = require('express-validator');

exports.createClinicRules = [
  body('name').trim().notEmpty().withMessage('Clinic name is required'),
];