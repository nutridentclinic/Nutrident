const { body } = require('express-validator');
const User = require('../models/User');

const FDI_TEETH = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
  51, 52, 53, 54, 55,
  61, 62, 63, 64, 65,
  71, 72, 73, 74, 75,
  81, 82, 83, 84, 85,
];

exports.FDI_TEETH = FDI_TEETH;

exports.createTreatmentPlanRules = [
  body('patientId')
    .isMongoId()
    .withMessage('Valid patientId is required')
    .custom(async (patientId) => {
      const patient = await User.findById(patientId);
      if (!patient || patient.role !== 'patient') {
        throw new Error('patientId must correspond to an existing patient account');
      }
      return true;
    }),
  body('title').isString().trim().notEmpty().withMessage('Treatment plan title is required'),
  body('notes').optional().isString().trim(),
  body('steps').isArray({ min: 1 }).withMessage('Treatment plan must contain at least 1 step'),
  body('steps.*.cost').isFloat({ min: 0 }).withMessage('Each step cost must be a non-negative number'),
  body('steps.*.status')
    .optional()
    .isIn(['planned', 'in-progress', 'completed', 'cancelled'])
    .withMessage('Step status must be planned, in-progress, completed, or cancelled'),
  body('steps.*.toothNumbers')
    .optional()
    .isArray()
    .withMessage('toothNumbers must be an array of FDI tooth numbers')
    .custom((toothNumbers) => {
      if (!Array.isArray(toothNumbers)) return true;
      for (const num of toothNumbers) {
        if (!FDI_TEETH.includes(Number(num))) {
          throw new Error(`Invalid tooth number ${num}. Must be a valid FDI tooth number.`);
        }
      }
      return true;
    }),
  body('status')
    .optional()
    .isIn(['active', 'completed', 'cancelled'])
    .withMessage('Status must be active, completed, or cancelled'),
  body('followUpRequired').optional().isBoolean().withMessage('followUpRequired must be a boolean'),
  body('followUpDate').optional().isISO8601().withMessage('followUpDate must be a valid ISO8601 date'),
];
