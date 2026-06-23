require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { attachRequestId } = require('./utils/requestId');
const logger = require('./config/logger');
const taskRouter = require('./routes/task.routes');
const scheduleRouter = require('./routes/schedule.routes');
const { errorMiddleware } = require('./middleware/error.middleware');

const app = express();

// Attach requestId to every request first
app.use(attachRequestId);

// Security headers
app.use(helmet());

// CORS — restrict to configured origin
app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));

// Rate limiting: 100 requests per 15 minutes per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ success: false, error: 'Too many requests' });
    },
  })
);

// Body parser — 10kb limit
app.use(express.json({ limit: '10kb' }));

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', { method: req.method, path: req.path, requestId: req.requestId });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'nova-backend' });
});

// Task routes
app.use('/api/v1/tasks', taskRouter);

// Schedule routes
app.use('/api/v1/schedules', scheduleRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Centralized error handler (must be last)
app.use(errorMiddleware);

module.exports = app;
