/**
 * routes/alerts.js
 *
 * Price alert CRUD routes (all protected – requires valid JWT):
 *   GET    /api/alerts        – list the current user's alerts
 *   POST   /api/alerts        – create a new alert
 *   PUT    /api/alerts/:id    – update an alert (toggle status, change fields)
 *   DELETE /api/alerts/:id    – delete an alert
 */

const express = require('express');
const db = require('../db/database');
const authenticate = require('../middleware/auth');

const router = express.Router();

// All routes in this file require authentication.
router.use(authenticate);

// ─── GET / ─────────────────────────────────────────────────────────────────

/**
 * List all alerts belonging to the authenticated user, newest first.
 * The `destinations` field is stored as a JSON string; we parse it before
 * returning so the client always receives a proper array.
 */
router.get('/', (req, res) => {
  try {
    const alerts = db.prepare(`
      SELECT * FROM alerts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.userId);

    // Parse the JSON destinations array for each alert.
    const parsed = alerts.map((a) => ({
      ...a,
      destinations: JSON.parse(a.destinations || '[]'),
    }));

    return res.json({ success: true, alerts: parsed });
  } catch (err) {
    console.error('[ALERTS GET /]', err);
    return res.status(500).json({ success: false, message: 'Could not fetch alerts.' });
  }
});

// ─── POST / ────────────────────────────────────────────────────────────────

/**
 * Create a new price alert.
 *
 * Body:
 *   origin            {string}   IATA code, e.g. "CLE"
 *   destinations      {string[]} Array of IATA codes, e.g. ["HOU","IAH"]
 *   depart_date_start {string}   ISO date
 *   depart_date_end   {string}   ISO date
 *   return_date_start {string}   ISO date (optional)
 *   return_date_end   {string}   ISO date (optional)
 *   max_price         {number}   Alert fires when price drops below this
 *   max_stops         {number}   Maximum acceptable layovers (default 1)
 */
router.post('/', (req, res) => {
  try {
    const {
      origin,
      destinations,
      depart_date_start,
      depart_date_end,
      return_date_start,
      return_date_end,
      max_price,
      max_stops = 1,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────
    if (!origin || !destinations || !Array.isArray(destinations) || destinations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'origin and a non-empty destinations array are required.',
      });
    }

    if (!depart_date_start || !depart_date_end) {
      return res.status(400).json({
        success: false,
        message: 'depart_date_start and depart_date_end are required.',
      });
    }

    // ── Insert ───────────────────────────────────────────────────────
    const result = db.prepare(`
      INSERT INTO alerts
        (user_id, origin, destinations, depart_date_start, depart_date_end,
         return_date_start, return_date_end, max_price, max_stops, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      req.user.userId,
      origin.toUpperCase(),
      JSON.stringify(destinations.map((d) => d.toUpperCase())),
      depart_date_start,
      depart_date_end,
      return_date_start || null,
      return_date_end || null,
      max_price || null,
      max_stops
    );

    // Fetch the newly created row to return it.
    const newAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(result.lastInsertRowid);
    newAlert.destinations = JSON.parse(newAlert.destinations || '[]');

    return res.status(201).json({ success: true, alert: newAlert });
  } catch (err) {
    console.error('[ALERTS POST /]', err);
    return res.status(500).json({ success: false, message: 'Could not create alert.' });
  }
});

// ─── PUT /:id ──────────────────────────────────────────────────────────────

/**
 * Update an existing alert.
 *
 * Allows partial updates — only fields present in the request body are changed.
 * Common use-cases:
 *   - Toggle status: { status: 'paused' } or { status: 'active' }
 *   - Adjust price threshold: { max_price: 299 }
 *   - Change date window: { depart_date_start: '...', depart_date_end: '...' }
 *
 * Ownership is enforced: a user can only update their own alerts.
 */
router.put('/:id', (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);

    // Verify the alert belongs to this user.
    const existing = db.prepare(
      'SELECT * FROM alerts WHERE id = ? AND user_id = ?'
    ).get(alertId, req.user.userId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    const {
      origin,
      destinations,
      depart_date_start,
      depart_date_end,
      return_date_start,
      return_date_end,
      max_price,
      max_stops,
      status,
    } = req.body;

    // Build update only for provided fields, falling back to existing values.
    db.prepare(`
      UPDATE alerts SET
        origin            = ?,
        destinations      = ?,
        depart_date_start = ?,
        depart_date_end   = ?,
        return_date_start = ?,
        return_date_end   = ?,
        max_price         = ?,
        max_stops         = ?,
        status            = ?
      WHERE id = ? AND user_id = ?
    `).run(
      origin !== undefined ? origin.toUpperCase() : existing.origin,
      destinations !== undefined
        ? JSON.stringify(destinations.map((d) => d.toUpperCase()))
        : existing.destinations,
      depart_date_start !== undefined ? depart_date_start : existing.depart_date_start,
      depart_date_end !== undefined ? depart_date_end : existing.depart_date_end,
      return_date_start !== undefined ? return_date_start : existing.return_date_start,
      return_date_end !== undefined ? return_date_end : existing.return_date_end,
      max_price !== undefined ? max_price : existing.max_price,
      max_stops !== undefined ? max_stops : existing.max_stops,
      status !== undefined ? status : existing.status,
      alertId,
      req.user.userId
    );

    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
    updated.destinations = JSON.parse(updated.destinations || '[]');

    return res.json({ success: true, alert: updated });
  } catch (err) {
    console.error('[ALERTS PUT /:id]', err);
    return res.status(500).json({ success: false, message: 'Could not update alert.' });
  }
});

// ─── DELETE /:id ───────────────────────────────────────────────────────────

/**
 * Permanently delete an alert.
 * Ownership is enforced — users can only delete their own alerts.
 */
router.delete('/:id', (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);

    // Check ownership before deleting.
    const existing = db.prepare(
      'SELECT id FROM alerts WHERE id = ? AND user_id = ?'
    ).get(alertId, req.user.userId);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    db.prepare('DELETE FROM alerts WHERE id = ?').run(alertId);

    return res.json({ success: true, message: 'Alert deleted.' });
  } catch (err) {
    console.error('[ALERTS DELETE /:id]', err);
    return res.status(500).json({ success: false, message: 'Could not delete alert.' });
  }
});

module.exports = router;
