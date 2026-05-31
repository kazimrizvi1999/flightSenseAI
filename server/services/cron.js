/**
 * services/cron.js
 *
 * Background job that runs every hour to check flight prices for all active
 * alerts and send email notifications when a deal is found.
 *
 * Schedule: '0 * * * *' — top of every hour
 *
 * For each active alert the job:
 *  1. Loops over every destination in the alert's destinations array.
 *  2. Searches current prices via amadeusService.
 *  3. Finds the cheapest qualifying flight (≤ max_price AND ≤ max_stops).
 *  4. If one is found:
 *       a. Updates the alert status to 'triggered'.
 *       b. Saves previous_price and current_price on the alert row.
 *       c. Sends a notification email to the alert owner.
 *  5. Saves a price_history record regardless of whether the threshold was met.
 *  6. Updates alert.last_checked and alert.current_price.
 *
 * Exported:
 *   startCronJob() — call once at app startup
 */

const cron          = require('node-cron');
const db            = require('../db/database');
const amadeusService = require('./amadeus');
const mailerService  = require('./mailer');

// ---------------------------------------------------------------------------
// pickDepartDate(alert)
// Chooses a representative departure date for the price check.
// Uses depart_date_start; if that's in the past it falls forward 7 days.
// ---------------------------------------------------------------------------
function pickDepartDate(alert) {
  const now   = new Date();
  const start = alert.depart_date_start ? new Date(alert.depart_date_start) : null;

  if (start && start > now) {
    // The alert's start date is still in the future — use it directly
    return alert.depart_date_start;
  }

  // Default: check prices one week from today
  const oneWeekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return oneWeekOut.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// checkAlert(alert)
// Processes a single alert: searches prices, evaluates threshold, notifies.
// ---------------------------------------------------------------------------
async function checkAlert(alert) {
  // Parse destinations from the JSON string stored in SQLite
  const destinations = (() => {
    try {
      return JSON.parse(alert.destinations || '[]');
    } catch {
      return [];
    }
  })();

  if (destinations.length === 0) {
    console.warn(`[Cron] Alert ${alert.id} has no destinations — skipping.`);
    return;
  }

  const departDate = pickDepartDate(alert);
  // Use return_date_start as the representative return date if set
  const returnDate = alert.return_date_start || null;

  // Fetch the alert owner's email for notifications
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(alert.user_id);
  if (!user) {
    console.warn(`[Cron] Alert ${alert.id}: user_id=${alert.user_id} not found.`);
    return;
  }

  // Iterate over every destination in the alert
  for (const destination of destinations) {
    const route = `${alert.origin}-${destination}`;
    console.log(`[Cron] Checking alert ${alert.id}: ${route} on ${departDate}`);

    let flights = [];
    try {
      flights = await amadeusService.searchFlights(
        alert.origin,
        destination,
        departDate,
        returnDate,
        1 // Check price for 1 adult
      );
    } catch (err) {
      console.error(`[Cron] Search failed for ${route}:`, err.message);
      continue; // Move on to the next destination
    }

    if (flights.length === 0) {
      console.log(`[Cron] No flights returned for ${route}.`);
      continue;
    }

    // ── Always log the cheapest price to price_history ────────────────────
    const cheapest = flights[0]; // Already sorted cheapest-first by the service
    db.prepare(`
      INSERT INTO price_history (route, price, airline, stops, travel_time_minutes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      route,
      cheapest.price,
      cheapest.airline,
      cheapest.stops,
      cheapest.totalTravelMinutes || 0
    );

    // ── Update alert's current price and last_checked timestamp ──────────
    db.prepare(`
      UPDATE alerts
      SET current_price = ?, last_checked = datetime('now')
      WHERE id = ?
    `).run(cheapest.price, alert.id);

    // ── Check threshold ───────────────────────────────────────────────────
    // Find the cheapest flight that satisfies BOTH the price AND stops limits.
    const qualifying = flights.find((f) => {
      const priceOk = alert.max_price == null || f.price <= alert.max_price;
      const stopsOk = alert.max_stops == null || f.stops <= alert.max_stops;
      return priceOk && stopsOk;
    });

    if (!qualifying) {
      console.log(`[Cron] Alert ${alert.id} ${route}: no qualifying flight (cheapest $${cheapest.price}).`);
      continue;
    }

    console.log(`[Cron] Alert ${alert.id} ${route}: TRIGGERED at $${qualifying.price} (threshold $${alert.max_price}).`);

    // ── Update alert status ───────────────────────────────────────────────
    db.prepare(`
      UPDATE alerts
      SET status         = 'triggered',
          previous_price = current_price,
          current_price  = ?,
          last_checked   = datetime('now')
      WHERE id = ?
    `).run(qualifying.price, alert.id);

    // ── Fetch user preferences to check if email notifications are enabled ─
    const prefs = db.prepare(
      'SELECT notification_email FROM user_preferences WHERE user_id = ?'
    ).get(alert.user_id);

    const emailEnabled = !prefs || prefs.notification_email !== 0; // default: enabled

    if (emailEnabled) {
      // Re-read the alert so we have the updated previous_price field
      const updatedAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alert.id);
      updatedAlert.destinations = destinations; // Already parsed

      await mailerService.sendAlertEmail(user.email, updatedAlert, qualifying);
    } else {
      console.log(`[Cron] Alert ${alert.id}: email notifications disabled for user ${alert.user_id}.`);
    }

    // Stop checking other destinations for this alert once triggered — avoids
    // sending multiple emails for the same alert in one cron run.
    break;
  }
}

// ---------------------------------------------------------------------------
// runPriceCheck()
// Fetches all active alerts and processes them sequentially to avoid hammering
// the Amadeus API with parallel requests.
// ---------------------------------------------------------------------------
async function runPriceCheck() {
  console.log('[Cron] Starting hourly price check...');
  const startTime = Date.now();

  // Only process alerts that are currently active (not paused or already triggered)
  const activeAlerts = db.prepare(`
    SELECT * FROM alerts WHERE status = 'active'
  `).all();

  console.log(`[Cron] Processing ${activeAlerts.length} active alert(s).`);

  // Process alerts one at a time to be respectful of API rate limits
  for (const alert of activeAlerts) {
    try {
      await checkAlert(alert);
    } catch (err) {
      // Log individual alert errors but continue processing the rest
      console.error(`[Cron] Unhandled error on alert ${alert.id}:`, err.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Cron] Price check complete. Processed ${activeAlerts.length} alerts in ${elapsed}s.`);
}

// ---------------------------------------------------------------------------
// startCronJob — public API
// ---------------------------------------------------------------------------

/**
 * startCronJob()
 *
 * Registers the hourly cron task and immediately runs one check on startup
 * (in development) so you can verify functionality without waiting an hour.
 *
 * Call once from index.js after the Express server starts.
 */
function startCronJob() {
  // Schedule: minute 0 of every hour ('0 * * * *')
  cron.schedule('0 * * * *', () => {
    runPriceCheck().catch((err) => {
      console.error('[Cron] Uncaught error in runPriceCheck:', err);
    });
  });

  console.log('[Cron] Hourly price-check job scheduled (runs at :00 every hour).');

  // Startup check disabled to preserve API quota.
  // The job runs automatically at the top of every hour.
}

module.exports = { startCronJob };
