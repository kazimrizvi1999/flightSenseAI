/**
 * services/claude.js
 *
 * Wraps the Anthropic Claude API to provide two AI features:
 *
 *  1. getRecommendations(flights, searchParams, userHistory, userPreferences)
 *     Analyses a list of flight offers using the user's context and returns
 *     the top-3 recommendations plus a written analysis.
 *
 *  2. chat(message, context)
 *     General-purpose conversational assistant. The system prompt positions
 *     the model as "FlightSense AI" with access to the user's data context.
 *
 * When ANTHROPIC_API_KEY is not set, both functions return graceful mock
 * responses so the rest of the application still works.
 */

const Anthropic = require('@anthropic-ai/sdk');

// ---------------------------------------------------------------------------
// Initialise the Anthropic client
// ---------------------------------------------------------------------------
let anthropic = null;

if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log('[Claude] Anthropic client initialised.');
} else {
  console.warn('[Claude] ANTHROPIC_API_KEY not set — mock responses will be used.');
}

// The model to use for all requests.
// Using claude-sonnet-4-20250514 for the best balance of intelligence and speed.
const MODEL = 'claude-sonnet-4-20250514';

// Maximum tokens for recommendation and chat responses
const MAX_TOKENS_RECOMMEND = 1500;
const MAX_TOKENS_CHAT      = 800;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * formatFlightForPrompt(flight, index)
 * Converts a flight offer object into a concise, readable string for the prompt.
 */
function formatFlightForPrompt(flight, index) {
  const stops     = flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop(s)`;
  const layover   = flight.layoverMinutes > 0 ? ` (${flight.layoverMinutes} min layover)` : '';
  const bestDeal  = flight.isBestDeal ? ' ★ BEST DEAL' : '';
  const duration  = flight.totalTravelMinutes ? `${Math.floor(flight.totalTravelMinutes / 60)}h ${flight.totalTravelMinutes % 60}m` : 'N/A';

  return [
    `Flight ${index + 1}${bestDeal}:`,
    `  Airline   : ${flight.airline} (${flight.airlineCode})`,
    `  Price     : $${flight.price} ${flight.currency}`,
    `  Route     : ${stops}${layover}`,
    `  Duration  : ${duration}`,
    `  Departure : ${flight.departureTime || 'N/A'}`,
    `  Arrival   : ${flight.arrivalTime || 'N/A'}`,
    flight.returnDepartureTime
      ? `  Return Dep: ${flight.returnDepartureTime}`
      : '',
  ].filter(Boolean).join('\n');
}

/**
 * formatPreferencesForPrompt(prefs)
 * Summarises user preferences into a short paragraph for the prompt.
 */
function formatPreferencesForPrompt(prefs) {
  if (!prefs) return 'No preferences on file.';

  const preferred   = JSON.parse(prefs.preferred_airlines || '[]');
  const blacklisted = JSON.parse(prefs.blacklisted_airlines || '[]');

  return [
    `Home airport     : ${prefs.home_airport || 'CLE'}`,
    `Budget range     : $${prefs.budget_min || 'any'} – $${prefs.budget_max || 'any'}`,
    `Max layover      : ${prefs.max_layover_hours || 2} hours`,
    preferred.length   ? `Preferred airlines: ${preferred.join(', ')}` : '',
    blacklisted.length ? `Avoid airlines    : ${blacklisted.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * formatSearchHistoryForPrompt(history)
 * Summarises the last few searches into a brief list.
 */
function formatSearchHistoryForPrompt(history) {
  if (!history || history.length === 0) return 'No recent searches.';

  return history
    .slice(0, 5) // Only use the 5 most recent searches to keep the prompt short
    .map((h) => `  ${h.origin} → ${h.destination} on ${h.depart_date} (${h.passengers} pax)`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// getRecommendations
// ---------------------------------------------------------------------------

/**
 * getRecommendations(flights, searchParams, userHistory, userPreferences)
 *
 * Sends all available flight options plus user context to Claude and asks it
 * to pick the top 3 and write a brief analysis.
 *
 * @param {object[]} flights          - Array of normalised flight offer objects
 * @param {object}   searchParams     - { origin, destination, departDate, returnDate, adults }
 * @param {object[]} userHistory      - Array of past search_history rows
 * @param {object}   userPreferences  - Row from user_preferences table
 * @returns {Promise<{recommendations: object[], analysis: string}>}
 */
async function getRecommendations(flights, searchParams, userHistory = [], userPreferences = null) {
  // ── Mock response when no API key ─────────────────────────────────────────
  if (!anthropic) {
    const top3 = flights.slice(0, 3).map((f, i) => ({
      rank   : i + 1,
      flightId: f.id,
      reason : i === 0
        ? 'Best value — lowest price with acceptable travel time.'
        : i === 1
        ? 'Great balance of price and comfort with fewer stops.'
        : 'Good alternative with a well-known carrier.',
    }));

    return {
      recommendations: top3,
      analysis: `Based on your search from ${searchParams.origin} to ${searchParams.destination}, we found ${flights.length} flights. The cheapest option is $${flights[0]?.price} with ${flights[0]?.airline}. Consider the nonstop options for convenience even at a slightly higher price.`,
    };
  }

  // ── Build the prompt ──────────────────────────────────────────────────────
  const flightList = flights.map(formatFlightForPrompt).join('\n\n');

  const prompt = `
You are a flight booking expert. Analyse the following flight options and the user's travel preferences, then recommend the top 3 best flights with clear reasoning.

## Search Details
- Route    : ${searchParams.origin} → ${searchParams.destination}
- Date     : ${searchParams.departDate}${searchParams.returnDate ? ` (return: ${searchParams.returnDate})` : ' (one-way)'}
- Passengers: ${searchParams.adults || 1} adult(s)

## User Preferences
${formatPreferencesForPrompt(userPreferences)}

## Recent Search History
${formatSearchHistoryForPrompt(userHistory)}

## Available Flights (${flights.length} options)
${flightList}

## Your Task
1. Pick the top 3 flights from the list above.
2. For each, provide:
   - rank (1, 2, or 3)
   - flightId (the "id" field from the flight data)
   - A 1–2 sentence reason tailored to this user's preferences
3. Write a 3–4 sentence overall analysis that highlights key trade-offs (price vs. speed vs. comfort) and any caveats.

Respond in this exact JSON format (no markdown fences, pure JSON):
{
  "recommendations": [
    { "rank": 1, "flightId": "...", "reason": "..." },
    { "rank": 2, "flightId": "...", "reason": "..." },
    { "rank": 3, "flightId": "...", "reason": "..." }
  ],
  "analysis": "..."
}
`.trim();

  try {
    const message = await anthropic.messages.create({
      model     : MODEL,
      max_tokens: MAX_TOKENS_RECOMMEND,
      messages  : [{ role: 'user', content: prompt }],
    });

    // Extract text from the response
    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse the JSON response from Claude
    const parsed = JSON.parse(responseText);
    return parsed;

  } catch (err) {
    console.error('[Claude] getRecommendations error:', err.message);
    // Return a minimal fallback so the route doesn't error out
    return {
      recommendations: flights.slice(0, 3).map((f, i) => ({
        rank   : i + 1,
        flightId: f.id,
        reason : 'Recommended based on price and travel time.',
      })),
      analysis: 'Unable to generate AI analysis at this time. Results are sorted by price.',
    };
  }
}

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------

/**
 * chat(message, context)
 *
 * General-purpose conversational AI assistant for FlightSense users.
 * The context object is embedded in the system prompt so the model can
 * give personalised, data-aware answers.
 *
 * @param {string} message  - The user's message
 * @param {object} context  - { alerts, searchHistory, preferences }
 * @returns {Promise<string>} - The assistant's reply text
 */
async function chat(message, context = {}) {
  // ── Mock response when no API key ─────────────────────────────────────────
  if (!anthropic) {
    return (
      "Hi! I'm FlightSense AI. I'm here to help you find the best flights and monitor prices. " +
      "To get started, try searching for a flight or setting up a price alert. " +
      "(Note: AI responses are currently in demo mode — please add your ANTHROPIC_API_KEY to enable full AI capabilities.)"
    );
  }

  // ── Build system prompt ───────────────────────────────────────────────────
  const { alerts = [], searchHistory = [], preferences = null } = context;

  const activeAlerts = alerts
    .filter((a) => a.status === 'active')
    .map((a) => `  • ${a.origin} → ${Array.isArray(a.destinations) ? a.destinations.join('/') : a.destinations} — max $${a.max_price}`)
    .join('\n') || '  None';

  const recentSearches = searchHistory
    .slice(0, 5)
    .map((h) => `  • ${h.origin} → ${h.destination} on ${h.depart_date}`)
    .join('\n') || '  None';

  const systemPrompt = `
You are FlightSense AI, a helpful and friendly flight booking assistant integrated into the FlightSense app.

Your role is to:
- Help users find the best flights for their needs and budget
- Explain flight pricing trends and what affects ticket prices
- Give advice on the best times to book
- Answer questions about specific airports, airlines, or routes
- Help interpret search results and price alerts
- Suggest alternatives when direct flights are expensive

## Current User Context
**Active Alerts:**
${activeAlerts}

**Recent Searches:**
${recentSearches}

**Preferences:**
${formatPreferencesForPrompt(preferences)}

## Guidelines
- Be concise and actionable — users want quick, useful answers
- When discussing prices, mention that prices fluctuate and suggest setting alerts
- If you don't have real-time data for a specific query, say so honestly
- Always end your message with a helpful follow-up suggestion or question
`.trim();

  try {
    const response = await anthropic.messages.create({
      model     : MODEL,
      max_tokens: MAX_TOKENS_CHAT,
      system    : systemPrompt,
      messages  : [{ role: 'user', content: message }],
    });

    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

  } catch (err) {
    console.error('[Claude] chat error:', err.message);
    return "I'm having trouble connecting to the AI service right now. Please try again in a moment.";
  }
}

module.exports = { getRecommendations, chat };
