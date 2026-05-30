/**
 * routes/flights.js
 *
 * Flight search routes:
 *   GET /api/flights/search   – search live flight offers via Amadeus
 *   GET /api/flights/history  – return the authenticated user's past searches
 */

const express = require('express');
const db = require('../db/database');
const authenticate = require('../middleware/auth');
const amadeusService = require('../services/amadeus');

const router = express.Router();

// ─── GET /search ──────────────────────────────────────────────────────────

/**
 * Search for flight offers.
 *
 * Query params:
 *   origin      {string}  IATA code, e.g. "CLE"
 *   destination {string}  IATA code, e.g. "HOU"
 *   departDate  {string}  ISO date, e.g. "2026-07-04"
 *   returnDate  {string}  ISO date for round trip (optional)
 *   adults      {number}  passenger count (default 1)
 *
 * Behaviour:
 *  - Calls amadeusService.searchFlights() which handles API or mock fallback.
 *  - If the user is authenticated, applies preference filters (blacklisted
 *    airlines, budget_max, max_layover_hours) and saves search history.
 *  - Returns results sorted cheapest-first (the service already sorts them,
 *    but we do a safety sort here too).
 */
router.get('/search', async (req, res) => {
  try {
    const { origin, destination, departDate, returnDate, adults = 1 } = req.query;

    // ── Input validation ─────────────────────────────────────────────
    if (!origin || !destination || !departDate) {
      return res.status(400).json({
        success: false,
        message: 'origin, destination, and departDate are required query parameters.',
      });
    }

    // ── Optional auth check (non-blocking) ───────────────────────────
    // We try to decode the token if present so we can apply preferences,
    // but we don't require authentication for this public endpoint.
    let currentUser = null;
    let userPreferences = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(
          authHeader.split(' ')[1],
          process.env.JWT_SECRET || 'flightsense_secret_key'
        );
        currentUser = decoded;
        userPreferences = db.prepare(
          'SELECT * FROM user_preferences WHERE user_id = ?'
        ).get(decoded.userId);
      } catch (_) {
        // Token invalid – continue as anonymous
      }
    }

    // ── Call Amadeus service ─────────────────────────────────────────
    let flights = await amadeusService.searchFlights(
      origin.toUpperCase(),
      destination.toUpperCase(),
      departDate,
      returnDate || null,
      parseInt(adults, 10)
    );

    // ── Apply user preference filters ────────────────────────────────
    if (userPreferences) {
      const blacklisted = JSON.parse(userPreferences.blacklisted_airlines || '[]');
      const maxBudget = userPreferences.budget_max;
      const maxLayoverHours = userPreferences.max_layover_hours;

      flights = flights.filter((f) => {
        // Exclude flights operated by blacklisted airlines
        if (blacklisted.includes(f.airlineCode)) return false;
        // Exclude flights over the user's maximum budget
        if (maxBudget && f.price > maxBudget) return false;
        // Exclude flights whose layover exceeds the user's preference
        if (maxLayoverHours && f.layoverMinutes > maxLayoverHours * 60) return false;
        return true;
      });
    }

    // Safety sort: cheapest first
    flights.sort((a, b) => a.price - b.price);

    // ── Persist search history for authenticated users ─────────────
    if (currentUser) {
      db.prepare(`
        INSERT INTO search_history
          (user_id, origin, destination, depart_date, return_date, passengers, results_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        currentUser.userId,
        origin.toUpperCase(),
        destination.toUpperCase(),
        departDate,
        returnDate || null,
        parseInt(adults, 10),
        flights.length
      );
    }

    return res.json({
      success: true,
      count: flights.length,
      flights,
    });
  } catch (err) {
    console.error('[FLIGHTS /search]', err);
    return res.status(500).json({ success: false, message: 'Flight search failed.' });
  }
});

// ─── GET /history ─────────────────────────────────────────────────────────

/**
 * Return the authenticated user's last 50 flight searches, newest first.
 * Requires a valid JWT.
 */
router.get('/history', authenticate, (req, res) => {
  try {
    const history = db.prepare(`
      SELECT id, origin, destination, depart_date, return_date,
             passengers, results_count, searched_at
      FROM search_history
      WHERE user_id = ?
      ORDER BY searched_at DESC
      LIMIT 50
    `).all(req.user.userId);

    return res.json({ success: true, history });
  } catch (err) {
    console.error('[FLIGHTS /history]', err);
    return res.status(500).json({ success: false, message: 'Could not fetch search history.' });
  }
});

module.exports = router;
