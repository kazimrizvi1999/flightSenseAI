/**
 * db/database.js
 *
 * Initializes the SQLite database using better-sqlite3 (synchronous API).
 * Creates all required tables if they don't already exist, then seeds
 * two example alerts for user_id=1 so the app has demo data on first run.
 *
 * Exports the `db` instance so other modules can run queries directly.
 */

const Database = require('better-sqlite3');
const path = require('path');

// Resolve absolute path to the SQLite file, stored in the db/ folder.
const DB_PATH = path.join(__dirname, 'flightsense.db');

// Open (or create) the database file. { verbose: console.log } can be
// uncommented during development to log every SQL statement.
const db = new Database(DB_PATH /*, { verbose: console.log } */);

// Enable WAL (Write-Ahead Logging) mode for better concurrent read performance.
db.pragma('journal_mode = WAL');

/**
 * initializeDatabase()
 *
 * Runs once at startup. Uses `CREATE TABLE IF NOT EXISTS` so existing data
 * is never overwritten on subsequent restarts.
 */
function initializeDatabase() {
  // ──────────────────────────────────────────────────────────
  // USERS table
  // Stores account credentials and basic profile information.
  // ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT    NOT NULL UNIQUE,
      password_hash TEXT   NOT NULL,
      name         TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ──────────────────────────────────────────────────────────
  // USER_PREFERENCES table
  // One row per user. Stores travel preferences used to filter
  // search results and personalise AI recommendations.
  // ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id              INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      home_airport         TEXT    NOT NULL DEFAULT 'CLE',
      budget_min           REAL,
      budget_max           REAL,
      max_layover_hours    INTEGER NOT NULL DEFAULT 2,
      -- JSON arrays stored as TEXT, e.g. '["AA","UA"]'
      preferred_airlines   TEXT    NOT NULL DEFAULT '[]',
      blacklisted_airlines TEXT    NOT NULL DEFAULT '[]',
      -- Boolean flags stored as INTEGER (0/1) per SQLite convention
      notification_email   INTEGER NOT NULL DEFAULT 1,
      notification_push    INTEGER NOT NULL DEFAULT 1,
      updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ──────────────────────────────────────────────────────────
  // ALERTS table
  // Each alert monitors a route for price drops. The destinations
  // column holds a JSON array so one alert can watch multiple
  // destination airports (e.g. ["HOU","IAH"]).
  // ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin            TEXT    NOT NULL,
      -- JSON array, e.g. '["HOU","IAH"]'
      destinations      TEXT    NOT NULL DEFAULT '[]',
      depart_date_start TEXT,
      depart_date_end   TEXT,
      return_date_start TEXT,
      return_date_end   TEXT,
      max_price         REAL,
      max_stops         INTEGER NOT NULL DEFAULT 1,
      -- One of: 'active' | 'paused' | 'triggered'
      status            TEXT    NOT NULL DEFAULT 'active',
      last_checked      TEXT,
      current_price     REAL,
      previous_price    REAL,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ──────────────────────────────────────────────────────────
  // PRICE_HISTORY table
  // Appended-only ledger of prices discovered by the cron job.
  // The route field follows the pattern "ORIGIN-DESTINATION",
  // e.g. "CLE-HOU". Used by the /priceHistory routes.
  // ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      route                TEXT    NOT NULL,
      price                REAL    NOT NULL,
      airline              TEXT,
      stops                INTEGER NOT NULL DEFAULT 0,
      travel_time_minutes  INTEGER,
      checked_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ──────────────────────────────────────────────────────────
  // SEARCH_HISTORY table
  // Records every search a logged-in user performs. Fed back
  // to Claude AI as context for personalised recommendations.
  // ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin         TEXT    NOT NULL,
      destination    TEXT    NOT NULL,
      depart_date    TEXT,
      return_date    TEXT,
      passengers     INTEGER NOT NULL DEFAULT 1,
      results_count  INTEGER NOT NULL DEFAULT 0,
      searched_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  console.log('[DB] All tables created / verified.');

  // ──────────────────────────────────────────────────────────
  // SEED DATA
  // Insert two example alerts for user_id=1 so the dashboard
  // has something to display immediately. Only seeds once —
  // we check whether the alerts already exist first.
  // ──────────────────────────────────────────────────────────
  seedExampleAlerts();
}

/**
 * seedExampleAlerts()
 *
 * Inserts two demo alerts (CLE→HOU and CLE→IAH) for user_id=1.
 * Also creates a placeholder user_id=1 row if none exists, so the foreign
 * key constraint is satisfied even before the first real registration.
 * Safe to call on every startup because it is gated by a row-count check.
 */
function seedExampleAlerts() {
  // Ensure a seed user exists so the FK constraint on alerts.user_id is met.
  // INSERT OR IGNORE means this is a no-op if user id=1 already exists.
  const bcrypt = require('bcryptjs');
  const seedHash = bcrypt.hashSync('seed_password_not_for_login', 8);
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, name)
    VALUES (1, 'seed@flightsense.local', ?, 'Demo User')
  `).run(seedHash);

  // Also create default preferences for the seed user (INSERT OR IGNORE).
  db.prepare(`
    INSERT OR IGNORE INTO user_preferences (user_id) VALUES (1)
  `).run();

  // Count how many alerts already exist for user 1.
  const existing = db.prepare(
    'SELECT COUNT(*) as cnt FROM alerts WHERE user_id = 1'
  ).get();

  // If at least one already exists, skip seeding to avoid duplicates.
  if (existing && existing.cnt > 0) {
    console.log('[DB] Seed alerts already present — skipping.');
    return;
  }

  const insertAlert = db.prepare(`
    INSERT INTO alerts
      (user_id, origin, destinations, depart_date_start, depart_date_end,
       return_date_start, return_date_end, max_price, max_stops, status)
    VALUES
      (@user_id, @origin, @destinations, @depart_date_start, @depart_date_end,
       @return_date_start, @return_date_end, @max_price, @max_stops, @status)
  `);

  // Alert 1: CLE → HOU (Houston Hobby)
  insertAlert.run({
    user_id: 1,
    origin: 'CLE',
    destinations: JSON.stringify(['HOU']),
    depart_date_start: '2026-07-01',
    depart_date_end: '2026-07-15',
    return_date_start: '2026-07-08',
    return_date_end: '2026-07-22',
    max_price: 350,
    max_stops: 1,
    status: 'active',
  });

  // Alert 2: CLE → IAH (Houston George Bush Intercontinental)
  insertAlert.run({
    user_id: 1,
    origin: 'CLE',
    destinations: JSON.stringify(['IAH']),
    depart_date_start: '2026-07-01',
    depart_date_end: '2026-07-31',
    return_date_start: '2026-07-07',
    return_date_end: '2026-08-07',
    max_price: 400,
    max_stops: 1,
    status: 'active',
  });

  console.log('[DB] Seeded 2 example alerts for user_id=1.');
}

// Run initialisation immediately when this module is first required.
initializeDatabase();

module.exports = db;
