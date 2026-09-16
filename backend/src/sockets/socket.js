const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Initializes Socket.IO: auth via JWT, and rooms for per-dentist live queue updates.
const initSocket = (io) => {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(); // allow anonymous connect for public queue-display screens
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(); // don't hard-fail the connection; just treat as unauthenticated
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Client joins a dentist's queue room to receive live token updates
    socket.on('queue:join', (dentistId) => {
      socket.join(`queue_${dentistId}`);
    });

    socket.on('queue:leave', (dentistId) => {
      socket.leave(`queue_${dentistId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = initSocket;