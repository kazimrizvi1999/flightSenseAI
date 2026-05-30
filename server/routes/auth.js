/**
 * routes/auth.js
 *
 * Authentication routes:
 *   POST /api/auth/register  – create a new account
 *   POST /api/auth/login     – verify credentials and return JWT
 *   GET  /api/auth/me        – return the current user's profile (protected)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const authenticate = require('../middleware/auth');

const router = express.Router();

// ─── Helper ────────────────────────────────────────────────────────────────

/**
 * signToken(payload)
 * Creates a signed JWT that expires in 7 days.
 */
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'flightsense_secret_key', {
    expiresIn: '7d',
  });
}

// ─── POST /register ────────────────────────────────────────────────────────

/**
 * Register a new user.
 *
 * Body: { email, password, name }
 *
 * Steps:
 *  1. Validate required fields.
 *  2. Check the email isn't already taken.
 *  3. Hash the password with bcrypt (salt rounds = 12).
 *  4. Insert the user row.
 *  5. Insert default preferences for the new user.
 *  6. Return a signed JWT and basic user object.
 */
router.post('/register', (req, res) => {
  try {
    const { email, password, name } = req.body;

    // ── Validation ──────────────────────────────────────────────────
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'email, password, and name are all required.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    // ── Uniqueness check ─────────────────────────────────────────────
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with that email already exists.',
      });
    }

    // ── Hash password ────────────────────────────────────────────────
    // 12 rounds is a good balance between security and speed (~300 ms).
    const passwordHash = bcrypt.hashSync(password, 12);

    // ── Insert user ──────────────────────────────────────────────────
    const insertUser = db.prepare(`
      INSERT INTO users (email, password_hash, name)
      VALUES (?, ?, ?)
    `);
    const result = insertUser.run(email.toLowerCase(), passwordHash, name);
    const userId = result.lastInsertRowid;

    // ── Insert default preferences ───────────────────────────────────
    // All fields use table defaults; we just need the row to exist so
    // preference routes never return "not found" for a new user.
    db.prepare(`
      INSERT INTO user_preferences (user_id) VALUES (?)
    `).run(userId);

    // ── Build and sign the token ─────────────────────────────────────
    const token = signToken({ userId, email: email.toLowerCase(), name });

    return res.status(201).json({
      success: true,
      token,
      user: { id: userId, email: email.toLowerCase(), name },
    });
  } catch (err) {
    console.error('[AUTH /register]', err);
    return res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

// ─── POST /login ───────────────────────────────────────────────────────────

/**
 * Log in an existing user.
 *
 * Body: { email, password }
 *
 * Steps:
 *  1. Look up the user by email.
 *  2. Compare the submitted password with the stored bcrypt hash.
 *  3. Return a JWT and the user's public profile.
 */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required.',
      });
    }

    // ── Look up user ─────────────────────────────────────────────────
    const user = db.prepare(
      'SELECT id, email, password_hash, name FROM users WHERE email = ?'
    ).get(email.toLowerCase());

    // We give a generic error message to avoid leaking whether an email
    // exists in the system.
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // ── Verify password ──────────────────────────────────────────────
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // ── Sign token and respond ───────────────────────────────────────
    const token = signToken({ userId: user.id, email: user.email, name: user.name });

    return res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error('[AUTH /login]', err);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

// ─── GET /me ───────────────────────────────────────────────────────────────

/**
 * Return the authenticated user's profile.
 * The `authenticate` middleware already validated the JWT and set req.user.
 */
router.get('/me', authenticate, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, email, name, created_at FROM users WHERE id = ?'
    ).get(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error('[AUTH /me]', err);
    return res.status(500).json({ success: false, message: 'Could not fetch user.' });
  }
});

module.exports = router;
