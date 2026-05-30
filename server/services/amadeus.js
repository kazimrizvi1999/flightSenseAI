/**
 * services/amadeus.js
 *
 * Wraps the official Amadeus Node.js SDK to provide flight offer searches.
 * When API credentials are not configured (development / CI), falls back to
 * a set of realistic mock flights so the rest of the app still works.
 *
 * Exported:
 *   searchFlights(origin, destination, departDate, returnDate, adults)
 *     → Promise<FlightOffer[]>
 */

const Amadeus = require('amadeus');

// ---------------------------------------------------------------------------
// Initialise the Amadeus SDK client
// The SDK reads AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET automatically
// from the environment, but we pass them explicitly for clarity and to make
// the "missing credentials" check straightforward.
// ---------------------------------------------------------------------------
let amadeusClient = null;

if (process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET) {
  amadeusClient = new Amadeus({
    clientId    : process.env.AMADEUS_CLIENT_ID,
    clientSecret: process.env.AMADEUS_CLIENT_SECRET,
    // Use the test environment by default; switch to 'production' when ready.
    hostname    : process.env.AMADEUS_HOSTNAME || 'test',
  });
  console.log('[Amadeus] Client initialised (hostname: ' + (process.env.AMADEUS_HOSTNAME || 'test') + ')');
} else {
  console.warn('[Amadeus] No API credentials found — mock data will be used.');
}

// ---------------------------------------------------------------------------
// Airline name lookup (common carriers)
// ---------------------------------------------------------------------------
const AIRLINE_NAMES = {
  AA: 'American Airlines',
  UA: 'United Airlines',
  DL: 'Delta Air Lines',
  WN: 'Southwest Airlines',
  B6: 'JetBlue Airways',
  AS: 'Alaska Airlines',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
  G4: 'Allegiant Air',
  HA: 'Hawaiian Airlines',
};

/**
 * getAirlineName(code)
 * Returns the human-readable airline name for an IATA carrier code.
 */
function getAirlineName(code) {
  return AIRLINE_NAMES[code] || code;
}

// ---------------------------------------------------------------------------
// buildBookingLink(origin, destination, departDate, returnDate, adults)
// Builds a Google Flights deep-link so users can proceed directly to booking.
// ---------------------------------------------------------------------------
function buildBookingLink(origin, destination, departDate, returnDate, adults) {
  const base = 'https://www.google.com/flights';
  const params = new URLSearchParams({
    hl : 'en',
    gl : 'us',
    // Google Flights uses a specific URL structure; this produces a reasonable
    // pre-filled search page even if the exact deep-link format changes.
    q  : `flights from ${origin} to ${destination} on ${departDate}`,
  });
  return `${base}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// transformOffer(offer)
// Converts a raw Amadeus FlightOffer v2 object into our simplified shape.
// ---------------------------------------------------------------------------
function transformOffer(offer) {
  try {
    const itineraries  = offer.itineraries || [];
    const outbound     = itineraries[0] || {};
    const inbound      = itineraries[1] || null; // null for one-way

    const outSegments  = outbound.segments || [];
    const firstSeg     = outSegments[0] || {};
    const lastSeg      = outSegments[outSegments.length - 1] || {};

    // Parse ISO 8601 duration "PT2H35M" → minutes
    const parseDuration = (iso) => {
      if (!iso) return 0;
      const h = (iso.match(/(\d+)H/) || [0, 0])[1];
      const m = (iso.match(/(\d+)M/) || [0, 0])[1];
      return parseInt(h, 10) * 60 + parseInt(m, 10);
    };

    const outDurationMin = parseDuration(outbound.duration);

    // Layover = total duration minus sum of individual flight times
    const flightMin = outSegments.reduce((sum, seg) => sum + parseDuration(seg.duration), 0);
    const layoverMin = Math.max(0, outDurationMin - flightMin);

    // Number of stops = segments - 1
    const stops = outSegments.length - 1;

    // Carrier code from the first segment's operating/marketing carrier
    const airlineCode = firstSeg.carrierCode || (firstSeg.operating && firstSeg.operating.carrierCode) || 'XX';

    // Return leg times (if round-trip)
    let returnDepartureTime = null;
    let returnArrivalTime   = null;
    if (inbound) {
      const inSegs = inbound.segments || [];
      returnDepartureTime = inSegs[0]?.departure?.at || null;
      returnArrivalTime   = inSegs[inSegs.length - 1]?.arrival?.at || null;
    }

    const price     = parseFloat(offer.price?.grandTotal || offer.price?.total || 0);
    const currency  = offer.price?.currency || 'USD';
    const origin    = firstSeg.departure?.iataCode || '';
    const dest      = lastSeg.arrival?.iataCode || '';

    return {
      id                : offer.id,
      price,
      currency,
      airline           : getAirlineName(airlineCode),
      airlineCode,
      stops,
      totalTravelMinutes: outDurationMin,
      layoverMinutes    : layoverMin,
      departureTime     : firstSeg.departure?.at || null,
      arrivalTime       : lastSeg.arrival?.at || null,
      returnDepartureTime,
      returnArrivalTime,
      bookingLink       : buildBookingLink(origin, dest, firstSeg.departure?.at?.slice(0, 10), returnDepartureTime?.slice(0, 10), 1),
      isBestDeal        : false, // populated after scoring
    };
  } catch (e) {
    console.error('[Amadeus] transformOffer error:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// markBestDeal(flights)
// Scores flights using a composite metric:
//   score = (normalised_price * 0.6) + (normalised_layover * 0.4)
// The flight with the lowest composite score is flagged as the "best deal".
// ---------------------------------------------------------------------------
function markBestDeal(flights) {
  if (!flights || flights.length === 0) return flights;

  const prices   = flights.map((f) => f.price);
  const layovers = flights.map((f) => f.layoverMinutes);

  const minPrice   = Math.min(...prices);
  const maxPrice   = Math.max(...prices);
  const minLayover = Math.min(...layovers);
  const maxLayover = Math.max(...layovers);

  const normalise = (val, min, max) =>
    max === min ? 0 : (val - min) / (max - min);

  let bestScore = Infinity;
  let bestIdx   = 0;

  flights.forEach((f, i) => {
    const normPrice   = normalise(f.price, minPrice, maxPrice);
    const normLayover = normalise(f.layoverMinutes, minLayover, maxLayover);
    const score = normPrice * 0.6 + normLayover * 0.4;
    if (score < bestScore) {
      bestScore = score;
      bestIdx   = i;
    }
  });

  flights[bestIdx].isBestDeal = true;
  return flights;
}

// ---------------------------------------------------------------------------
// Mock data fallback
// Returned when Amadeus credentials are missing or the API call fails.
// Flights are realistic CLE → HOU options with varied carriers and prices.
// ---------------------------------------------------------------------------
function getMockFlights(origin, destination, departDate, returnDate) {
  const dep  = departDate || '2026-07-04';
  const ret  = returnDate || null;
  const base = `${dep}T`;

  const mock = [
    {
      id                : 'mock-1',
      price             : 218.50,
      currency          : 'USD',
      airline           : 'Southwest Airlines',
      airlineCode       : 'WN',
      stops             : 1,
      totalTravelMinutes: 195,
      layoverMinutes    : 75,
      departureTime     : `${base}06:00:00`,
      arrivalTime       : `${base}10:15:00`,
      returnDepartureTime: ret ? `${ret}T15:00:00` : null,
      returnArrivalTime : ret ? `${ret}T19:20:00` : null,
      bookingLink       : buildBookingLink(origin, destination, dep, ret, 1),
      isBestDeal        : false,
    },
    {
      id                : 'mock-2',
      price             : 249.00,
      currency          : 'USD',
      airline           : 'United Airlines',
      airlineCode       : 'UA',
      stops             : 0,
      totalTravelMinutes: 155,
      layoverMinutes    : 0,
      departureTime     : `${base}08:30:00`,
      arrivalTime       : `${base}11:05:00`,
      returnDepartureTime: ret ? `${ret}T12:00:00` : null,
      returnArrivalTime : ret ? `${ret}T17:35:00` : null,
      bookingLink       : buildBookingLink(origin, destination, dep, ret, 1),
      isBestDeal        : false,
    },
    {
      id                : 'mock-3',
      price             : 189.99,
      currency          : 'USD',
      airline           : 'Spirit Airlines',
      airlineCode       : 'NK',
      stops             : 1,
      totalTravelMinutes: 240,
      layoverMinutes    : 95,
      departureTime     : `${base}05:00:00`,
      arrivalTime       : `${base}09:00:00`,
      returnDepartureTime: ret ? `${ret}T18:00:00` : null,
      returnArrivalTime : ret ? `${ret}T23:30:00` : null,
      bookingLink       : buildBookingLink(origin, destination, dep, ret, 1),
      isBestDeal        : false,
    },
    {
      id                : 'mock-4',
      price             : 312.40,
      currency          : 'USD',
      airline           : 'American Airlines',
      airlineCode       : 'AA',
      stops             : 0,
      totalTravelMinutes: 150,
      layoverMinutes    : 0,
      departureTime     : `${base}13:15:00`,
      arrivalTime       : `${base}15:45:00`,
      returnDepartureTime: ret ? `${ret}T07:00:00` : null,
      returnArrivalTime : ret ? `${ret}T12:30:00` : null,
      bookingLink       : buildBookingLink(origin, destination, dep, ret, 1),
      isBestDeal        : false,
    },
    {
      id                : 'mock-5',
      price             : 275.60,
      currency          : 'USD',
      airline           : 'Delta Air Lines',
      airlineCode       : 'DL',
      stops             : 1,
      totalTravelMinutes: 210,
      layoverMinutes    : 60,
      departureTime     : `${base}10:00:00`,
      arrivalTime       : `${base}13:30:00`,
      returnDepartureTime: ret ? `${ret}T09:45:00` : null,
      returnArrivalTime : ret ? `${ret}T15:15:00` : null,
      bookingLink       : buildBookingLink(origin, destination, dep, ret, 1),
      isBestDeal        : false,
    },
  ];

  // Sort cheapest first, then mark the best deal
  mock.sort((a, b) => a.price - b.price);
  return markBestDeal(mock);
}

// ---------------------------------------------------------------------------
// searchFlights — public API
// ---------------------------------------------------------------------------

/**
 * searchFlights(origin, destination, departDate, returnDate, adults)
 *
 * Searches the Amadeus API for flight offers and returns a normalised array.
 * Falls back to mock data when the API is unavailable.
 *
 * @param {string}      origin       - IATA departure airport code, e.g. "CLE"
 * @param {string}      destination  - IATA arrival airport code, e.g. "HOU"
 * @param {string}      departDate   - ISO date string, e.g. "2026-07-04"
 * @param {string|null} returnDate   - ISO date string for round trip, or null
 * @param {number}      adults       - Number of adult passengers (≥ 1)
 * @returns {Promise<object[]>}      - Sorted, scored flight offer array
 */
async function searchFlights(origin, destination, departDate, returnDate = null, adults = 1) {
  // ── Fallback: no API client configured ────────────────────────────────────
  if (!amadeusClient) {
    console.log('[Amadeus] Using mock data (no client configured).');
    return getMockFlights(origin, destination, departDate, returnDate);
  }

  try {
    // Build the request params
    const params = {
      originLocationCode     : origin,
      destinationLocationCode: destination,
      departureDate          : departDate,
      adults                 : adults,
      max                    : 20,         // Request up to 20 offers
      currencyCode           : 'USD',
    };

    // Add return date for round trips
    if (returnDate) {
      params.returnDate = returnDate;
    }

    // Call the Amadeus Flight Offers Search v2 endpoint
    const response = await amadeusClient.shopping.flightOffersSearch.get(params);

    // response.data is an array of FlightOffer objects
    const offers = response.data || [];

    if (offers.length === 0) {
      console.warn('[Amadeus] API returned no offers — falling back to mock data.');
      return getMockFlights(origin, destination, departDate, returnDate);
    }

    // Transform each offer into our normalised shape, filter out any that
    // failed transformation (transformOffer returns null on error).
    const flights = offers
      .map(transformOffer)
      .filter(Boolean);

    // Sort by price ascending
    flights.sort((a, b) => a.price - b.price);

    // Mark the best-deal flight
    return markBestDeal(flights);

  } catch (err) {
    // Log the Amadeus error and return mock data so the UI still works
    console.error('[Amadeus] API error:', err.description || err.message || err);
    return getMockFlights(origin, destination, departDate, returnDate);
  }
}

module.exports = { searchFlights };
