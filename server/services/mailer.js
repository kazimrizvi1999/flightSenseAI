/**
 * services/mailer.js
 *
 * Nodemailer wrapper for sending transactional emails from FlightSense.
 * Currently provides one exported function:
 *
 *   sendAlertEmail(userEmail, alert, flight)
 *     → Sends an HTML price-drop notification email.
 *
 * Configuration (all from environment variables):
 *   EMAIL_HOST  – SMTP host, e.g. "smtp.gmail.com"
 *   EMAIL_PORT  – SMTP port, e.g. 587
 *   EMAIL_USER  – SMTP username / sender address
 *   EMAIL_PASS  – SMTP password or app-specific password
 *
 * When email credentials are not configured the function logs a warning and
 * returns without throwing, so the cron job continues running.
 */

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Create a reusable transporter
// nodemailer.createTransport() is synchronous; we call it once at module
// load time so the connection pool is ready when the cron job fires.
// ---------------------------------------------------------------------------
let transporter = null;

if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host  : process.env.EMAIL_HOST,
    port  : parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465, // true for port 465 (TLS)
    auth  : {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Reject self-signed certificates in production; allow in development
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  console.log('[Mailer] Nodemailer transporter configured.');
} else {
  console.warn('[Mailer] Email credentials not set — emails will be logged only.');
}

// ---------------------------------------------------------------------------
// buildAlertEmailHtml(alert, flight, priceDrop)
// Generates the HTML body for a price-drop alert email.
// ---------------------------------------------------------------------------

/**
 * buildAlertEmailHtml(alert, flight, priceDrop)
 *
 * @param {object} alert     - Alert row from the database (destinations parsed)
 * @param {object} flight    - Normalised flight offer from amadeusService
 * @param {number} priceDrop - How much the price dropped (previous - current)
 * @returns {string}         - Full HTML email body
 */
function buildAlertEmailHtml(alert, flight, priceDrop) {
  // Format helpers
  const fmtPrice   = (p) => `$${parseFloat(p).toFixed(2)}`;
  const fmtDate    = (d) => d ? new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'N/A';
  const fmtTime    = (t) => t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
  const stops      = flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`;
  const dropBadge  = priceDrop > 0 ? `↓ ${fmtPrice(priceDrop)} drop` : 'Price alert triggered';
  const destinations = Array.isArray(alert.destinations) ? alert.destinations.join(' / ') : alert.destinations;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FlightSense Price Alert</title>
  <style>
    /* Base reset */
    body { margin: 0; padding: 0; background: #f4f7fb; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }

    /* Header */
    .header { background: linear-gradient(135deg, #1a56db 0%, #1e429f 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .header p  { margin: 6px 0 0; color: #bfdbfe; font-size: 14px; }

    /* Badge */
    .badge { display: inline-block; background: #d1fae5; color: #065f46; border-radius: 20px; padding: 6px 16px; font-size: 13px; font-weight: 600; margin: 20px 0 0; }

    /* Content */
    .content { padding: 32px 40px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin: 0 0 12px; }

    /* Route card */
    .route-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; }
    .route { display: flex; align-items: center; justify-content: space-between; }
    .airport-code { font-size: 32px; font-weight: 700; color: #1e293b; }
    .route-arrow  { font-size: 20px; color: #94a3b8; }
    .airline-row  { margin-top: 12px; font-size: 14px; color: #64748b; }

    /* Price comparison */
    .price-row { display: flex; align-items: baseline; gap: 16px; margin: 20px 0; }
    .price-current { font-size: 42px; font-weight: 800; color: #1a56db; }
    .price-old     { font-size: 18px; color: #94a3b8; text-decoration: line-through; }
    .price-drop    { background: #ecfdf5; color: #16a34a; border-radius: 6px; padding: 4px 10px; font-size: 13px; font-weight: 600; }

    /* Flight detail grid */
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0 28px; }
    .detail-item  { background: #f8fafc; border-radius: 8px; padding: 12px 16px; }
    .detail-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 4px; }
    .detail-value { font-size: 14px; font-weight: 600; color: #1e293b; }

    /* CTA button */
    .cta-wrapper { text-align: center; margin: 28px 0 8px; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #1a56db, #1e429f); color: #ffffff !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }

    /* Footer */
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
    .footer a { color: #1a56db; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- ── Header ── -->
    <div class="header">
      <h1>✈ FlightSense</h1>
      <p>Your price alert has been triggered!</p>
      <div class="badge">🎉 ${dropBadge}</div>
    </div>

    <!-- ── Content ── -->
    <div class="content">
      <p class="section-title">Flight Details</p>

      <!-- Route card -->
      <div class="route-card">
        <div class="route">
          <span class="airport-code">${alert.origin}</span>
          <span class="route-arrow">→</span>
          <span class="airport-code">${destinations}</span>
        </div>
        <div class="airline-row">
          <strong>${flight.airline}</strong> &middot; ${stops} &middot;
          ${Math.floor(flight.totalTravelMinutes / 60)}h ${flight.totalTravelMinutes % 60}m total
        </div>
      </div>

      <!-- Price comparison -->
      <p class="section-title">Current Price</p>
      <div class="price-row">
        <span class="price-current">${fmtPrice(flight.price)}</span>
        ${alert.previous_price ? `<span class="price-old">${fmtPrice(alert.previous_price)}</span>` : ''}
        ${priceDrop > 0 ? `<span class="price-drop">Save ${fmtPrice(priceDrop)}</span>` : ''}
      </div>
      ${alert.max_price ? `<p style="font-size:13px;color:#6b7280;margin-top:-8px;">Your alert threshold: ${fmtPrice(alert.max_price)}</p>` : ''}

      <!-- Flight details grid -->
      <p class="section-title" style="margin-top:20px;">Trip Information</p>
      <div class="details-grid">
        <div class="detail-item">
          <div class="detail-label">Departure</div>
          <div class="detail-value">${fmtTime(flight.departureTime)}</div>
          <div style="font-size:12px;color:#94a3b8;">${fmtDate(flight.departureTime)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Arrival</div>
          <div class="detail-value">${fmtTime(flight.arrivalTime)}</div>
          <div style="font-size:12px;color:#94a3b8;">${fmtDate(flight.arrivalTime)}</div>
        </div>
        ${flight.returnDepartureTime ? `
        <div class="detail-item">
          <div class="detail-label">Return Departure</div>
          <div class="detail-value">${fmtTime(flight.returnDepartureTime)}</div>
          <div style="font-size:12px;color:#94a3b8;">${fmtDate(flight.returnDepartureTime)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Return Arrival</div>
          <div class="detail-value">${fmtTime(flight.returnArrivalTime)}</div>
          <div style="font-size:12px;color:#94a3b8;">${fmtDate(flight.returnArrivalTime)}</div>
        </div>
        ` : ''}
        <div class="detail-item">
          <div class="detail-label">Airline</div>
          <div class="detail-value">${flight.airline}</div>
          <div style="font-size:12px;color:#94a3b8;">${flight.airlineCode}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Stops</div>
          <div class="detail-value">${stops}</div>
          ${flight.layoverMinutes > 0 ? `<div style="font-size:12px;color:#94a3b8;">${flight.layoverMinutes} min layover</div>` : ''}
        </div>
      </div>

      <!-- Book Now button -->
      <div class="cta-wrapper">
        <a href="${flight.bookingLink}" class="cta-btn" target="_blank" rel="noopener noreferrer">
          Book Now — ${fmtPrice(flight.price)}
        </a>
      </div>
      <p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:12px;">
        Prices change quickly. Book soon to lock in this rate.
      </p>
    </div>

    <!-- ── Footer ── -->
    <div class="footer">
      <p>
        You received this email because you set up a price alert on
        <a href="http://localhost:3000">FlightSense</a>.
      </p>
      <p style="margin-top:4px;">
        Alert: ${alert.origin} → ${destinations} &middot;
        Dates: ${fmtDate(alert.depart_date_start)} – ${fmtDate(alert.depart_date_end)}
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

// ---------------------------------------------------------------------------
// sendAlertEmail — public API
// ---------------------------------------------------------------------------

/**
 * sendAlertEmail(userEmail, alert, flight)
 *
 * Sends an HTML price-drop alert email to the specified address.
 * When the mailer is not configured, prints the email details to the console
 * instead of throwing an error — this allows the cron job to keep running.
 *
 * @param {string} userEmail - Recipient email address
 * @param {object} alert     - Alert row (with destinations parsed to array)
 * @param {object} flight    - Normalised flight offer from amadeusService
 * @returns {Promise<void>}
 */
async function sendAlertEmail(userEmail, alert, flight) {
  // Calculate price drop for display purposes
  const priceDrop =
    alert.previous_price && flight.price < alert.previous_price
      ? alert.previous_price - flight.price
      : 0;

  const destinations = Array.isArray(alert.destinations)
    ? alert.destinations.join(' / ')
    : alert.destinations;

  const subject = priceDrop > 0
    ? `✈ Price dropped $${priceDrop.toFixed(2)}! ${alert.origin} → ${destinations} now $${flight.price}`
    : `✈ FlightSense Alert: ${alert.origin} → ${destinations} at $${flight.price}`;

  const html = buildAlertEmailHtml(alert, flight, priceDrop);

  // ── No transporter: log instead of sending ────────────────────────────────
  if (!transporter) {
    console.log('[Mailer] (no-op) Would send email:');
    console.log(`  To     : ${userEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Price  : $${flight.price} (alert max: $${alert.max_price})`);
    return;
  }

  // ── Send the email ─────────────────────────────────────────────────────────
  try {
    const info = await transporter.sendMail({
      from   : `"FlightSense" <${process.env.EMAIL_USER}>`,
      to     : userEmail,
      subject,
      html,
      // Plain-text fallback for email clients that don't render HTML
      text: [
        `FlightSense Price Alert`,
        ``,
        `${alert.origin} → ${destinations}`,
        `Current price: $${flight.price}`,
        priceDrop > 0 ? `You saved: $${priceDrop.toFixed(2)}` : '',
        ``,
        `Airline: ${flight.airline} (${flight.airlineCode})`,
        `Stops  : ${flight.stops === 0 ? 'Nonstop' : flight.stops + ' stop(s)'}`,
        ``,
        `Book now: ${flight.bookingLink}`,
      ].filter(Boolean).join('\n'),
    });

    console.log(`[Mailer] Alert email sent to ${userEmail} (messageId: ${info.messageId})`);
  } catch (err) {
    // Log but don't rethrow — a failed email should not crash the cron job
    console.error('[Mailer] Failed to send email:', err.message);
  }
}

module.exports = { sendAlertEmail };
