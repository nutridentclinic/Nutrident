const { body } = require('express-validator');

exports.createPrescriptionRules = [
  body('patientId').isMongoId().withMessage('Valid patientId is required'),
  body('appointmentId').optional({ nullable: true }).isMongoId().withMessage('Valid appointmentId required if provided'),
  body('diagnosis').optional().isString().trim(),
  body('medicines')
    .isArray({ min: 1 })
    .withMessage('At least one medicine is required'),
  body('medicines.*.name')
    .notEmpty()
    .withMessage('Medicine name is required')
    .isString()
    .trim(),
  body('medicines.*.dosage')
    .notEmpty()
    .withMessage('Dosage is required (e.g. 500mg)')
    .isString()
    .trim(),
  body('medicines.*.frequency')
    .notEmpty()
    .withMessage('Frequency is required (e.g. 1-0-1)')
    .isString()
    .trim(),
  body('medicines.*.durationDays')
    .isInt({ min: 1, max: 365 })
    .withMessage('durationDays must be between 1 and 365'),
  body('medicines.*.instructions').optional().isString().trim(),
  body('additionalNotes').optional().isString().trim(),
  body('followUpDate').optional({ nullable: true }).isString().trim(),
];

exports.voidPrescriptionRules = [
  body('reason').optional().isString().trim(),
];

