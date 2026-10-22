const getCorsOrigins = require('../corsOrigins');
const escapeRegex = require('../escapeRegex');
const safeCompareHex = require('../safeCompareHex');

describe('CORS origin configuration', () => {
  test('preserves explicit origins and includes loopback Vite hosts in development', () => {
    expect(getCorsOrigins({ CORS_ORIGINS: 'https://clinic.example, https://staff.example,https://clinic.example', NODE_ENV: 'development' })).toEqual([
      'https://clinic.example',
      'https://staff.example',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ]);
  });

  test('falls back to configured URLs and local Vite origins outside production', () => {
    expect(getCorsOrigins({ CLIENT_URL: 'https://clinic.example', NODE_ENV: 'development' })).toEqual([
      'https://clinic.example',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ]);
  });

  test('does not add local origins in production', () => {
    expect(getCorsOrigins({ CLIENT_URL: 'https://clinic.example', NODE_ENV: 'production' })).toEqual([
      'https://clinic.example',
    ]);
  });
});

test('escapes user text before using it as a regular expression', () => {
  const input = 'Dr. (Lee)+ [North]';
  const escaped = escapeRegex(input);
  expect(new RegExp(escaped, 'i').test(input)).toBe(true);
  expect(new RegExp(escaped, 'i').test('DrX Lee North')).toBe(false);
});

test('compares signatures only when both hexadecimal values are valid and equal length', () => {
  expect(safeCompareHex('aabbcc', 'aabbcc')).toBe(true);
  expect(safeCompareHex('aabbcc', 'aabbcd')).toBe(false);
  expect(safeCompareHex('aabbcc', 'aa')).toBe(false);
  expect(safeCompareHex('not-hex', 'not-hex')).toBe(false);
});