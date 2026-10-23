const { param, body } = require('express-validator');

const FDI_TEETH = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
];

const CONDITIONS = [
  'healthy',
  'decayed',
  'filled',
  'missing',
  'crowned',
  'root-canal',
  'implant',
  'extracted',
];

exports.FDI_TEETH = FDI_TEETH;
exports.CONDITIONS = CONDITIONS;

exports.updateToothRules = [
  param('toothNumber')
    .toInt()
    .custom((val) => FDI_TEETH.includes(val))
    .withMessage('toothNumber must be one of the 32 valid FDI tooth numbers (11-18, 21-28, 31-38, 41-48)'),
  body('condition')
    .isIn(CONDITIONS)
    .withMessage(`condition must be one of: ${CONDITIONS.join(', ')}`),
  body('notes').optional().isString().trim(),
];
