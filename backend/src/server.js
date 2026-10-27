require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const initSocket = require('./sockets/socket');
const startReminderJob = require('./jobs/appointmentReminder.job');
const getCorsOrigins = require('./utils/corsOrigins');
const { validateSecurityEnv } = require('./utils/validateEnv');

validateSecurityEnv();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
});
initSocket(io);
app.set('io', io); // so controllers can do req.app.get('io').emit(...)

const start = async () => {
  await connectDB();
  startReminderJob();

  server.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

start();

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection (process will keep serving): ${err?.stack || err?.message || err}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err?.stack || err?.message || err}`);
  process.exit(1);
});