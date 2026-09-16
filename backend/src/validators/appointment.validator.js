const { body } = require('express-validator');

exports.createAppointmentRules = [
  body('dentistId').isMongoId().withMessage('Valid dentistId is required'),
  body('date').isISO8601().withMessage('Valid date is required (YYYY-MM-DD)'),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime must be in HH:MM format'),
  body('mode').optional().isIn(['in-clinic', 'video', 'audio']),
];

exports.rescheduleRules = [
  body('date').isISO8601().withMessage('Valid date is required (YYYY-MM-DD)'),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime must be in HH:MM format'),
];