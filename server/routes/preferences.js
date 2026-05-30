/**
 * routes/preferences.js
 *
 * User preference routes (all protected — requires valid JWT):
 *
 *   GET /api/preferences   – retrieve the current user's preferences
 *   PUT /api/preferences   – update the current user's preferences
 *
 * Preferences control how flight search results are filtered and how the
 * AI recommendations are personalised.
 */

const express      = require('express');
const db           = require('../db/database');
const authenticate = require('../middleware/auth');

const router = express.Router();

// All routes in this file require authentication.
router.use(authenticate);

// ---------------------------------------------------------------------------
// Helper: parsePreferences(row)
// Converts stored JSON strings back to arrays so the client always receives
// proper JavaScript arrays, not raw strings.
// ---------------------------------------------------------------------------
function parsePreferences(row) {
  if (!row) return null;
  return {
    ...row,
    preferred_airlines  : (() => { try { return JSON.parse(row.preferred_airlines || '[]');   } catch { return []; } })(),
    blacklisted_airlines: (() => { try { return JSON.parse(row.blacklisted_airlines || '[]'); } catch { return []; } })(),
    // Convert SQLite integers back to booleans for the client
    notification_email  : row.notification_email !== 0,
    notification_push   : row.notification_push  !== 0,
  };
}

// ─── GET / ─────────────────────────────────────────────────────────────────

/**
 * Return the authenticated user's preferences.
 *
 * If no preferences row exists yet (shouldn't happen after registration, but
 * handled gracefully), one is created with default values before returning.
 */
router.get('/', (req, res) => {
  try {
    let prefs = db.prepare(
      'SELECT * FROM user_preferences WHERE user_id = ?'
    ).get(req.user.userId);

    // Safety net: create default preferences if the row is missing
    if (!prefs) {
      db.prepare(
        'INSERT INTO user_preferences (user_id) VALUES (?)'
      ).run(req.user.userId);

      prefs = db.prepare(
        'SELECT * FROM user_preferences WHERE user_id = ?'
      ).get(req.user.userId);
    }

    return res.json({ success: true, preferences: parsePreferences(prefs) });
  } catch (err) {
    console.error('[PREFERENCES GET /]', err);
    return res.status(500).json({ success: false, message: 'Could not fetch preferences.' });
  }
});

// ─── PUT / ─────────────────────────────────────────────────────────────────

/**
 * Update the authenticated user's preferences.
 *
 * Accepts a partial update — only the fields provided in the request body
 * are changed. All other fields retain their current values.
 *
 * Accepted body fields:
 *   home_airport         {string}    IATA code, e.g. "CLE"
 *   budget_min           {number}    Minimum budget (used in UI only; not a search filter)
 *   budget_max           {number}    Maximum budget — filters out more expensive results
 *   max_layover_hours    {number}    Flights with longer layovers are filtered out
 *   preferred_airlines   {string[]}  IATA carrier codes to prioritise
 *   blacklisted_airlines {string[]}  IATA carrier codes to exclude from results
 *   notification_email   {boolean}   Receive email alerts
 *   notification_push    {boolean}   Receive push notifications (future feature)
 */
router.put('/', (req, res) => {
  try {
    // Fetch current preferences so we can apply partial updates correctly
    let current = db.prepare(
      'SELECT * FROM user_preferences WHERE user_id = ?'
    ).get(req.user.userId);

    // Auto-create if missing
    if (!current) {
      db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(req.user.userId);
      current = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.userId);
    }

    const {
      home_airport,
      budget_min,
      budget_max,
      max_layover_hours,
      preferred_airlines,
      blacklisted_airlines,
      notification_email,
      notification_push,
    } = req.body;

    // ── Validate array fields ────────────────────────────────────────────
    if (preferred_airlines !== undefined && !Array.isArray(preferred_airlines)) {
      return res.status(400).json({
        success: false,
        message: 'preferred_airlines must be an array of IATA codes.',
      });
    }
    if (blacklisted_airlines !== undefined && !Array.isArray(blacklisted_airlines)) {
      return res.status(400).json({
        success: false,
        message: 'blacklisted_airlines must be an array of IATA codes.',
      });
    }

    // ── Build merged values ──────────────────────────────────────────────
    // For each field, use the new value if provided, otherwise keep existing.
    const newHomeAirport       = home_airport         !== undefined ? home_airport.toUpperCase()                          : current.home_airport;
    const newBudgetMin         = budget_min           !== undefined ? parseFloat(budget_min)                              : current.budget_min;
    const newBudgetMax         = budget_max           !== undefined ? parseFloat(budget_max)                              : current.budget_max;
    const newMaxLayover        = max_layover_hours    !== undefined ? parseInt(max_layover_hours, 10)                     : current.max_layover_hours;
    const newPreferred         = preferred_airlines   !== undefined ? JSON.stringify(preferred_airlines.map((c) => c.toUpperCase()))   : current.preferred_airlines;
    const newBlacklisted       = blacklisted_airlines !== undefined ? JSON.stringify(blacklisted_airlines.map((c) => c.toUpperCase())) : current.blacklisted_airlines;
    // Convert boolean → SQLite integer (0/1)
    const newNotifEmail        = notification_email   !== undefined ? (notification_email ? 1 : 0)                        : current.notification_email;
    const newNotifPush         = notification_push    !== undefined ? (notification_push  ? 1 : 0)                        : current.notification_push;

    // ── Persist ──────────────────────────────────────────────────────────
    db.prepare(`
      UPDATE user_preferences
      SET home_airport         = ?,
          budget_min           = ?,
          budget_max           = ?,
          max_layover_hours    = ?,
          preferred_airlines   = ?,
          blacklisted_airlines = ?,
          notification_email   = ?,
          notification_push    = ?,
          updated_at           = datetime('now')
      WHERE user_id = ?
    `).run(
      newHomeAirport,
      isNaN(newBudgetMin)  ? null : newBudgetMin,
      isNaN(newBudgetMax)  ? null : newBudgetMax,
      newMaxLayover,
      newPreferred,
      newBlacklisted,
      newNotifEmail,
      newNotifPush,
      req.user.userId
    );

    // Fetch and return the updated row
    const updated = db.prepare(
      'SELECT * FROM user_preferences WHERE user_id = ?'
    ).get(req.user.userId);

    return res.json({ success: true, preferences: parsePreferences(updated) });
  } catch (err) {
    console.error('[PREFERENCES PUT /]', err);
    return res.status(500).json({ success: false, message: 'Could not update preferences.' });
  }
});

module.exports = router;
