const escapeRegex = require('../escapeRegex');

describe('escapeRegex Utility', () => {
  it('escapes all special regex characters', () => {
    const input = 'hello.world*test+one?two^three$four{five}(six)|seven[eight]\\nine';
    const escaped = escapeRegex(input);
    expect(escaped).toBe('hello\\.world\\*test\\+one\\?two\\^three\\$four\\{five\\}\\(six\\)\\|seven\\[eight\\]\\\\nine');

    // Verify it safely compiles into a RegExp that matches the literal string
    const rx = new RegExp(escaped);
    expect(rx.test(input)).toBe(true);
    expect(rx.test('hello world test')).toBe(false);
  });

  it('handles null, undefined, empty, and numeric values safely', () => {
    expect(escapeRegex('')).toBe('');
    expect(escapeRegex(null)).toBe('');
    expect(escapeRegex(undefined)).toBe('');
    expect(escapeRegex(12345)).toBe('12345');
  });

  it('leaves standard alphanumeric strings untouched', () => {
    expect(escapeRegex('DrNutrident Dental Clinic 2026')).toBe('DrNutrident Dental Clinic 2026');
  });

  it('exports both function and .escapeRegex property', () => {
    expect(typeof escapeRegex).toBe('function');
    expect(escapeRegex.escapeRegex).toBe(escapeRegex);
  });
});
