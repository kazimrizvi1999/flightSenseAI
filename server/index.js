/**
 * index.js
 *
 * FlightSense API server — Express application entry point.
 *
 * Responsibilities:
 *  1. Load environment variables from .env
 *  2. Import and initialise the SQLite database (runs migrations/seeding)
 *  3. Configure Express middleware (CORS, JSON body parser)
 *  4. Mount all route modules under /api/*
 *  5. Start the hourly price-check cron job
 *  6. Listen on PORT (default 5000)
 *
 * Start the server:
 *   npm start        → node index.js
 *   npm run dev      → nodemon index.js  (auto-restart on file changes)
 */

// ── 1. Environment variables ──────────────────────────────────────────────
// Load .env before any other module so process.env is fully populated.
require('dotenv').config();

// ── 2. Core dependencies ──────────────────────────────────────────────────
const express = require('express');
const cors    = require('cors');

// ── 3. Initialise the database ────────────────────────────────────────────
// Importing the module runs initializeDatabase() automatically.
// This creates all tables (IF NOT EXISTS) and seeds example data on first run.
const db = require('./db/database');

// ── 4. Import route modules ───────────────────────────────────────────────
const authRoutes         = require('./routes/auth');
const flightsRoutes      = require('./routes/flights');
const alertsRoutes       = require('./routes/alerts');
const aiRoutes           = require('./routes/ai');
const preferencesRoutes  = require('./routes/preferences');
const priceHistoryRoutes = require('./routes/priceHistory');

// ── 5. Import the cron job ────────────────────────────────────────────────
const { startCronJob } = require('./services/cron');

// ── 6. Create the Express application ────────────────────────────────────
const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────

/**
 * CORS
 * Only allow requests from the React frontend running at http://localhost:3000.
 * Adjust the origin for staging / production deployments.
 */
app.use(cors({
  origin     : process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true, // Allow cookies / Authorization headers from the browser
}));

/**
 * JSON body parser
 * Allows route handlers to read req.body as a JavaScript object.
 * 10 mb limit is generous for our use case (flight arrays can be large).
 */
app.use(express.json({ limit: '10mb' }));

/**
 * URL-encoded body parser
 * Supports form submissions in addition to JSON.
 */
app.use(express.urlencoded({ extended: true }));

// ─── Health check ──────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Simple liveness probe used by load balancers and CI pipelines.
 * Returns the server version and current UTC timestamp.
 */
app.get('/api/health', (req, res) => {
  res.json({
    status   : 'ok',
    service  : 'FlightSense API',
    version  : '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Route mounting ────────────────────────────────────────────────────────

// Authentication: register, login, profile
app.use('/api/auth', authRoutes);

// Flight search and search history
app.use('/api/flights', flightsRoutes);

// Price alerts (CRUD)
app.use('/api/alerts', alertsRoutes);

// AI recommendations and chat
app.use('/api/ai', aiRoutes);

// User travel preferences
app.use('/api/preferences', preferencesRoutes);

// Price history and trend stats
app.use('/api/price-history', priceHistoryRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────

/**
 * Catch-all for any route that doesn't match the above mounts.
 * Returns a JSON 404 instead of Express's default HTML page.
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global error handler ─────────────────────────────────────────────────

/**
 * Express catches any error passed to next(err) and routes it here.
 * We return a generic 500 in production to avoid leaking stack traces.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

// ─── Start server ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '5000', 10);

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         FlightSense API Server           ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Listening on  : http://localhost:${PORT}   ║`);
  console.log(`║  Environment   : ${(process.env.NODE_ENV || 'development').padEnd(22)}║`);
  console.log(`║  Database      : SQLite (better-sqlite3)  ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Start the background price-check cron job after the server is up
  startCronJob();
});

module.exports = app; // Export for testing
