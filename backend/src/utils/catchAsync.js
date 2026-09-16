// Wraps async controller functions so we don't need try/catch everywhere
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};