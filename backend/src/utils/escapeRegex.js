function escapeRegex(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

escapeRegex.escapeRegex = escapeRegex;

module.exports = escapeRegex;