/**
 * routes/priceHistory.js
 *
 * Price history routes (public — no authentication required):
 *
 *   GET /api/price-history/:route        – return price snapshots for a route
 *   GET /api/price-history/:route/stats  – return min price and trend direction
 *
 * Route format: "ORIGIN-DESTINATION", e.g. "CLE-HOU"
 * All data comes from the price_history table, populated by the cron job.
 */

const express = require('express');
const db      = require('../db/database');

const router = express.Router();

// ─── GET /:route ──────────────────────────────────────────────────────────

/**
 * Return all price snapshots recorded in the last 30 days for a specific route.
 *
 * Params:
 *   route  {string}  e.g. "CLE-HOU"
 *
 * Query params (optional):
 *   days   {number}  Number of days to look back (default 30, max 90)
 *
 * Response:
 *   {
 *     success  : true,
 *     route    : "CLE-HOU",
 *     history  : [{ id, route, price, airline, stops, travel_time_minutes, checked_at }]
 *   }
 */
router.get('/:route', (req, res) => {
  try {
    const route = req.params.route.toUpperCase();

    // Validate route format: must be two IATA codes joined by a hyphen
    if (!/^[A-Z]{3}-[A-Z]{3}$/.test(route)) {
      return res.status(400).json({
        success: false,
        message: 'Route must be in "AAA-BBB" format (two 3-letter IATA codes).',
      });
    }

    // Cap the lookback window to 90 days to prevent large queries
    const days = Math.min(parseInt(req.query.days || '30', 10), 90);
    if (isNaN(days) || days < 1) {
      return res.status(400).json({
        success: false,
        message: 'days must be a positive integer (max 90).',
      });
    }

    const history = db.prepare(`
      SELECT id, route, price, airline, stops, travel_time_minutes, checked_at
      FROM price_history
      WHERE route = ?
        AND checked_at >= datetime('now', ? || ' days')
      ORDER BY checked_at ASC
    `).all(route, `-${days}`);

    return res.json({
      success: true,
      route,
      days,
      count  : history.length,
      history,
    });

  } catch (err) {
    console.error('[PRICE_HISTORY GET /:route]', err);
    return res.status(500).json({ success: false, message: 'Could not fetch price history.' });
  }
});

// ─── GET /:route/stats ────────────────────────────────────────────────────

/**
 * Return summary statistics for a route:
 *   - minPrice  : lowest price seen in the last 30 days
 *   - maxPrice  : highest price seen in the last 30 days
 *   - avgPrice  : average price in the last 30 days
 *   - trend     : 'rising' | 'dropping' | 'stable' — based on a 7-day linear
 *                 regression of daily average prices
 *   - dataPoints: number of snapshots used for the calculation
 *
 * Linear regression:
 *   We bucket prices by day, compute each day's average, then calculate the
 *   slope of the best-fit line through those points.
 *   slope > +1  → 'rising'
 *   slope < -1  → 'dropping'
 *   otherwise   → 'stable'
 *
 * Params:
 *   route  {string}  e.g. "CLE-HOU"
 */
router.get('/:route/stats', (req, res) => {
  try {
    const route = req.params.route.toUpperCase();

    if (!/^[A-Z]{3}-[A-Z]{3}$/.test(route)) {
      return res.status(400).json({
        success: false,
        message: 'Route must be in "AAA-BBB" format.',
      });
    }

    // ── Aggregate stats over the last 30 days ────────────────────────────
    const stats30 = db.prepare(`
      SELECT
        MIN(price)  AS minPrice,
        MAX(price)  AS maxPrice,
        AVG(price)  AS avgPrice,
        COUNT(*)    AS dataPoints
      FROM price_history
      WHERE route = ?
        AND checked_at >= datetime('now', '-30 days')
    `).get(route);

    if (!stats30 || stats30.dataPoints === 0) {
      return res.json({
        success   : true,
        route,
        minPrice  : null,
        maxPrice  : null,
        avgPrice  : null,
        trend     : 'unknown',
        dataPoints: 0,
        message   : 'No price history available for this route yet.',
      });
    }

    // ── Compute 7-day trend via linear regression ────────────────────────
    // Fetch daily average prices for the last 7 days, one row per day.
    const dailyRows = db.prepare(`
      SELECT
        DATE(checked_at) AS day,
        AVG(price)       AS avgPrice
      FROM price_history
      WHERE route = ?
        AND checked_at >= datetime('now', '-7 days')
      GROUP BY DATE(checked_at)
      ORDER BY day ASC
    `).all(route);

    let trend = 'stable';

    if (dailyRows.length >= 2) {
      // Simple linear regression: slope = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
      // x = day index (0, 1, 2, …), y = average price
      const n  = dailyRows.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

      dailyRows.forEach((row, i) => {
        sumX  += i;
        sumY  += row.avgPrice;
        sumXY += i * row.avgPrice;
        sumX2 += i * i;
      });

      const denom = n * sumX2 - sumX * sumX;
      // Guard against a flat / zero-variance case
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        // Threshold: ±$1 per day is considered a meaningful trend
        if (slope > 1)  trend = 'rising';
        if (slope < -1) trend = 'dropping';
      }
    }

    return res.json({
      success   : true,
      route,
      minPrice  : parseFloat(stats30.minPrice.toFixed(2)),
      maxPrice  : parseFloat(stats30.maxPrice.toFixed(2)),
      avgPrice  : parseFloat(stats30.avgPrice.toFixed(2)),
      trend,
      dataPoints: stats30.dataPoints,
    });

  } catch (err) {
    console.error('[PRICE_HISTORY GET /:route/stats]', err);
    return res.status(500).json({ success: false, message: 'Could not compute price stats.' });
  }
});

module.exports = router;
