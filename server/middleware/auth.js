/**
 * middleware/auth.js
 *
 * Express middleware that verifies JWT Bearer tokens sent in the
 * Authorization header. On success it attaches the decoded payload
 * to `req.user` so downstream route handlers can access the caller's
 * userId and email without querying the database again.
 *
 * Usage:
 *   const authenticate = require('../middleware/auth');
 *   router.get('/protected', authenticate, (req, res) => { ... });
 */

const jwt = require('jsonwebtoken');

/**
 * authenticate(req, res, next)
 *
 * 1. Reads the "Authorization: Bearer <token>" header.
 * 2. Verifies the token signature and expiry using JWT_SECRET.
 * 3. Attaches `req.user` (decoded payload) and calls next().
 * 4. Responds with 401 if the token is missing, malformed, or expired.
 */
function authenticate(req, res, next) {
  // ── Step 1: Extract the Authorization header ──────────────────────
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'No authorization header provided.',
    });
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Authorization header must use the Bearer scheme.',
    });
  }

  const token = parts[1];

  // ── Step 2: Verify the token ──────────────────────────────────────
  try {
    // jwt.verify() throws if the token is invalid or expired.
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'flightsense_secret_key');

    // ── Step 3: Attach decoded payload and continue ───────────────
    // Payload shape set during sign-in: { userId, email, name }
    req.user = decoded;
    next();
  } catch (err) {
    // Distinguish between an expired token and any other JWT error so
    // the client can show a more helpful message.
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please log in again.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
  }
}

module.exports = authenticate;
