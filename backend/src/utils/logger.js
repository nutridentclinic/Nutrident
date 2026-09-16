/* Simple structured logger. Swap with winston/pino later if needed. */
const format = (level, msg) => `[${new Date().toISOString()}] [${level}] ${msg}`;

module.exports = {
  info: (msg) => console.log(format('INFO', msg)),
  error: (msg) => console.error(format('ERROR', msg)),
  warn: (msg) => console.warn(format('WARN', msg)),
};