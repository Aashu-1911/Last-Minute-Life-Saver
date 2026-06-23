const app = require('./app');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`N.O.V.A. backend running on port ${PORT}`, { port: PORT });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
  process.exit(1);
});
