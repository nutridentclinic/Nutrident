const { body } = require('express-validator');

exports.createStaffRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 15 }).withMessage('Valid phone number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['receptionist', 'admin']).withMessage("role must be 'receptionist' or 'admin'"),
];