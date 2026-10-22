const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const Dentist = require('../models/Dentist');
const canAccessDentistQueue = require('../utils/queueAccess');

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
      next(new Error('Invalid or expired authentication token.'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Client joins a dentist's queue room to receive live token updates
    socket.on('queue:join', async (dentistId) => {
      if (!socket.user || !['admin', 'receptionist', 'dentist'].includes(socket.user.role)) {
        socket.emit('queue:error', { message: 'Authentication with a staff or owning dentist account is required.' });
        return;
      }
      const dentistProfile = socket.user.role === 'dentist' ? await Dentist.findOne({ user: socket.user.id }) : null;
      if (!canAccessDentistQueue(socket.user, dentistId, dentistProfile)) {
        socket.emit('queue:error', { message: 'You do not have access to this dentist queue.' });
        return;
      }
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