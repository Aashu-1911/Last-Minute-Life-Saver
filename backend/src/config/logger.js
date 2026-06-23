const { createLogger, format, transports } = require('winston');

const { combine, timestamp, json, colorize, simple } = format;

const isProduction = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: isProduction ? 'info' : 'debug',
  format: combine(timestamp(), json()),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (!isProduction) {
  logger.add(
    new transports.Console({
      format: combine(colorize(), simple()),
    })
  );
}

module.exports = logger;
