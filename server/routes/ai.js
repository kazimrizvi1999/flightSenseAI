/**
 * routes/ai.js
 *
 * AI-powered routes (all protected — requires a valid JWT):
 *
 *   POST /api/ai/recommend  – analyse flight search results and return top-3 picks
 *   POST /api/ai/chat       – conversational assistant with user context
 */

const express      = require('express');
const db           = require('../db/database');
const authenticate = require('../middleware/auth');
const claudeService = require('../services/claude');

const router = express.Router();

// All routes in this file require a valid JWT.
router.use(authenticate);

// ─── POST /recommend ──────────────────────────────────────────────────────

/**
 * Analyse flight offers and return AI-powered recommendations.
 *
 * Body:
 *   flights      {object[]}  Array of normalised flight offer objects (from /flights/search)
 *   searchParams {object}    The search query used: { origin, destination, departDate, returnDate, adults }
 *
 * The handler enriches the Claude prompt with the user's search history and
 * preferences so recommendations are personalised, not generic.
 *
 * Response:
 *   {
 *     success: true,
 *     recommendations: [{ rank, flightId, reason }],
 *     analysis: string
 *   }
 */
router.post('/recommend', async (req, res) => {
  try {
    const { flights, searchParams } = req.body;

    // ── Validate input ───────────────────────────────────────────────────
    if (!flights || !Array.isArray(flights) || flights.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'flights must be a non-empty array.',
      });
    }

    if (!searchParams || !searchParams.origin || !searchParams.destination) {
      return res.status(400).json({
        success: false,
        message: 'searchParams with origin and destination is required.',
      });
    }

    // ── Fetch user context ───────────────────────────────────────────────
    // Pull the last 10 searches so Claude understands the user's travel patterns.
    const userHistory = db.prepare(`
      SELECT origin, destination, depart_date, return_date, passengers
      FROM search_history
      WHERE user_id = ?
      ORDER BY searched_at DESC
      LIMIT 10
    `).all(req.user.userId);

    // Pull the user's saved preferences for personalised recommendations.
    const userPreferences = db.prepare(
      'SELECT * FROM user_preferences WHERE user_id = ?'
    ).get(req.user.userId);

    // ── Call Claude ──────────────────────────────────────────────────────
    const result = await claudeService.getRecommendations(
      flights,
      searchParams,
      userHistory,
      userPreferences
    );

    return res.json({
      success: true,
      recommendations: result.recommendations,
      analysis       : result.analysis,
    });

  } catch (err) {
    console.error('[AI /recommend]', err);
    return res.status(500).json({
      success: false,
      message: 'AI recommendation failed. Please try again.',
    });
  }
});

// ─── POST /chat ───────────────────────────────────────────────────────────

/**
 * Conversational AI assistant.
 *
 * Body:
 *   message {string}  The user's message / question
 *   context {object}  Optional extra context provided by the frontend
 *                     (e.g. the flights currently visible on screen)
 *
 * The handler automatically enriches the context with:
 *   - The user's active price alerts
 *   - The user's last 5 searches
 *   - The user's saved preferences
 *
 * Response:
 *   { success: true, response: string }
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, context: clientContext = {} } = req.body;

    // ── Validate input ───────────────────────────────────────────────────
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'message is required and must be a non-empty string.',
      });
    }

    // ── Fetch user context ───────────────────────────────────────────────
    // Active alerts give the AI awareness of what the user is watching.
    const alerts = db.prepare(`
      SELECT * FROM alerts
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 10
    `).all(req.user.userId).map((a) => ({
      ...a,
      destinations: (() => {
        try { return JSON.parse(a.destinations || '[]'); } catch { return []; }
      })(),
    }));

    // Recent searches help the AI make contextually relevant suggestions.
    const searchHistory = db.prepare(`
      SELECT origin, destination, depart_date, return_date, passengers
      FROM search_history
      WHERE user_id = ?
      ORDER BY searched_at DESC
      LIMIT 5
    `).all(req.user.userId);

    const preferences = db.prepare(
      'SELECT * FROM user_preferences WHERE user_id = ?'
    ).get(req.user.userId);

    // Merge server-side context with any extra context from the client.
    const fullContext = {
      ...clientContext,
      alerts,
      searchHistory,
      preferences,
    };

    // ── Call Claude ──────────────────────────────────────────────────────
    const responseText = await claudeService.chat(message.trim(), fullContext);

    return res.json({
      success : true,
      response: responseText,
    });

  } catch (err) {
    console.error('[AI /chat]', err);
    return res.status(500).json({
      success: false,
      message: 'Chat request failed. Please try again.',
    });
  }
});

module.exports = router;
