const { body } = require('express-validator');

exports.createAppointmentRules = [
  body('dentistId').optional().isMongoId().withMessage('Valid dentistId is required if provided'),
  body('date').isISO8601().withMessage('Valid date is required (YYYY-MM-DD)'),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime must be in HH:MM format'),
  body('reason').optional().isString().trim(),
  body('mode').optional().isIn(['in-clinic']),
];

exports.createStaffAppointmentRules = [
  body('patientId').isMongoId().withMessage('Valid patientId is required'),
  body('dentistId').optional().isMongoId().withMessage('Valid dentistId is required if provided'),
  body('date').isISO8601().withMessage('Valid date is required (YYYY-MM-DD)'),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime must be in HH:MM format'),
  body('mode').optional().isIn(['in-clinic']),
  body('reasonForVisit').optional().isString().trim(),
];

exports.rescheduleRules = [
  body('date').isISO8601().withMessage('Valid date is required (YYYY-MM-DD)'),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime must be in HH:MM format'),
];