/**
 * services/flights.js  (formerly amadeus.js)
 *
 * Flight search powered by the Sky-Scrapper API on RapidAPI.
 * Sky-Scrapper scrapes Google Flights / Skyscanner data and returns
 * real-time prices — free tier gives ~50-100 requests/month.
 *
 * Sign up at: https://rapidapi.com/apiheya/api/sky-scrapper
 * Subscribe to the free plan and copy your RapidAPI key.
 *
 * When RAPIDAPI_KEY is not set in .env the service falls back to
 * realistic mock data so the rest of the app still works.
 *
 * Exported:
 *   searchFlights(origin, destination, departDate, returnDate, adults)
 *     → Promise<FlightOffer[]>
 */

const axios = require('axios');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com';

if (RAPIDAPI_KEY) {
  console.log('[Flights] Sky-Scrapper (RapidAPI) client ready.');
} else {
  console.warn('[Flights] No RAPIDAPI_KEY found — mock flight data will be used.');
}

// ---------------------------------------------------------------------------
// Airline name lookup
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
  SW: 'Southwest Airlines',
};

function getAirlineName(code) {
  return AIRLINE_NAMES[code] || code;
}

// ---------------------------------------------------------------------------
// Build a Google Flights deep-link for the "Book" button
// ---------------------------------------------------------------------------
function buildBookingLink(origin, destination, departDate, returnDate) {
  const q = returnDate
    ? `flights from ${origin} to ${destination} on ${departDate} return ${returnDate}`
    : `flights from ${origin} to ${destination} on ${departDate}`;
  return `https://www.google.com/flights?hl=en&gl=us&q=${encodeURIComponent(q)}`;
}

// ---------------------------------------------------------------------------
// Step 1 — look up the Sky-Scrapper "entityId" for an IATA airport code.
// Sky-Scrapper requires an internal entity ID rather than a raw IATA code.
// ---------------------------------------------------------------------------
async function getEntityId(iataCode) {
  const response = await axios.get(
    'https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport',
    {
      params : { query: iataCode, locale: 'en-US' },
      headers: {
        'X-RapidAPI-Key' : RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      timeout: 8000,
    }
  );

  const results = response.data?.data;
  if (!results || results.length === 0) {
    throw new Error(`No entity found for airport code: ${iataCode}`);
  }

  // Return the first (best) match
  return results[0].entityId;
}

// ---------------------------------------------------------------------------
// Step 2 — search flights using entity IDs
// ---------------------------------------------------------------------------
async function fetchFlights(originId, destinationId, departDate, returnDate, adults) {
  const params = {
    originSkyId     : originId,
    destinationSkyId: destinationId,
    originEntityId  : originId,
    destinationEntityId: destinationId,
    date            : departDate,
    adults          : adults || 1,
    currency        : 'USD',
    market          : 'en-US',
    countryCode     : 'US',
  };

  if (returnDate) {
    params.returnDate = returnDate;
  }

  const response = await axios.get(
    'https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights',
    {
      params,
      headers: {
        'X-RapidAPI-Key' : RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      timeout: 15000,
    }
  );

  return response.data?.data?.itineraries || [];
}

// ---------------------------------------------------------------------------
// Transform a Sky-Scrapper itinerary into our standard FlightOffer shape
// ---------------------------------------------------------------------------
function transformItinerary(itinerary, origin, destination, departDate, returnDate, index) {
  try {
    const legs    = itinerary.legs || [];
    const outLeg  = legs[0] || {};
    const inLeg   = legs[1] || null;

    // Carrier from the first leg's carriers list
    const carriers    = outLeg.carriers?.marketing || [];
    const carrier     = carriers[0] || {};
    const airlineCode = carrier.alternateId || carrier.id || 'XX';
    const airline     = carrier.name || getAirlineName(airlineCode);

    // Duration in minutes
    const totalTravelMinutes = outLeg.durationInMinutes || 0;

    // Stop count
    const stops = (outLeg.stopCount !== undefined) ? outLeg.stopCount : (outLeg.segments ? outLeg.segments.length - 1 : 0);

    // Layover = total duration minus sum of each segment's flight time
    const segments     = outLeg.segments || [];
    const flightMinutes = segments.reduce((sum, s) => sum + (s.durationInMinutes || 0), 0);
    const layoverMinutes = Math.max(0, totalTravelMinutes - flightMinutes);

    // Departure / arrival times
    const departureTime = outLeg.departure || null;
    const arrivalTime   = outLeg.arrival   || null;

    // Return leg
    const returnDepartureTime = inLeg ? (inLeg.departure || null) : null;
    const returnArrivalTime   = inLeg ? (inLeg.arrival   || null) : null;

    // Price — Sky-Scrapper nests price in itinerary.price.raw
    const price    = itinerary.price?.raw || itinerary.price?.formatted
      ? parseFloat(String(itinerary.price?.raw || itinerary.price?.formatted).replace(/[^0-9.]/g, ''))
      : 0;

    return {
      id                 : itinerary.id || `ss-${index}`,
      price,
      currency           : 'USD',
      airline,
      airlineCode,
      stops,
      totalTravelMinutes,
      layoverMinutes,
      departureTime,
      arrivalTime,
      returnDepartureTime,
      returnArrivalTime,
      bookingLink        : buildBookingLink(origin, destination, departDate, returnDate),
      isBestDeal         : false,
    };
  } catch (e) {
    console.error('[Flights] transformItinerary error:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// markBestDeal — composite score: 60% price + 40% layover (lower = better)
// ---------------------------------------------------------------------------
function markBestDeal(flights) {
  if (!flights || flights.length === 0) return flights;

  const prices   = flights.map((f) => f.price);
  const layovers = flights.map((f) => f.layoverMinutes);

  const minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
  const minLay   = Math.min(...layovers), maxLay = Math.max(...layovers);

  const norm = (v, lo, hi) => (hi === lo ? 0 : (v - lo) / (hi - lo));

  let bestScore = Infinity, bestIdx = 0;
  flights.forEach((f, i) => {
    const score = norm(f.price, minPrice, maxPrice) * 0.6 + norm(f.layoverMinutes, minLay, maxLay) * 0.4;
    if (score < bestScore) { bestScore = score; bestIdx = i; }
  });

  flights[bestIdx].isBestDeal = true;
  return flights;
}

// ---------------------------------------------------------------------------
// Mock data — used when RAPIDAPI_KEY is absent or API call fails
// ---------------------------------------------------------------------------
function getMockFlights(origin, destination, departDate, returnDate) {
  const dep  = departDate || '2026-07-04';
  const base = `${dep}T`;

  const mock = [
    { id:'mock-1', price:218.50, currency:'USD', airline:'Southwest Airlines',  airlineCode:'WN', stops:1, totalTravelMinutes:195, layoverMinutes:75,  departureTime:`${base}06:00:00`, arrivalTime:`${base}10:15:00`, returnDepartureTime: returnDate?`${returnDate}T15:00:00`:null, returnArrivalTime: returnDate?`${returnDate}T19:20:00`:null, bookingLink:buildBookingLink(origin,destination,dep,returnDate), isBestDeal:false },
    { id:'mock-2', price:249.00, currency:'USD', airline:'United Airlines',      airlineCode:'UA', stops:0, totalTravelMinutes:155, layoverMinutes:0,   departureTime:`${base}08:30:00`, arrivalTime:`${base}11:05:00`, returnDepartureTime: returnDate?`${returnDate}T12:00:00`:null, returnArrivalTime: returnDate?`${returnDate}T17:35:00`:null, bookingLink:buildBookingLink(origin,destination,dep,returnDate), isBestDeal:false },
    { id:'mock-3', price:189.99, currency:'USD', airline:'Spirit Airlines',      airlineCode:'NK', stops:1, totalTravelMinutes:240, layoverMinutes:95,  departureTime:`${base}05:00:00`, arrivalTime:`${base}09:00:00`, returnDepartureTime: returnDate?`${returnDate}T18:00:00`:null, returnArrivalTime: returnDate?`${returnDate}T23:30:00`:null, bookingLink:buildBookingLink(origin,destination,dep,returnDate), isBestDeal:false },
    { id:'mock-4', price:312.40, currency:'USD', airline:'American Airlines',    airlineCode:'AA', stops:0, totalTravelMinutes:150, layoverMinutes:0,   departureTime:`${base}13:15:00`, arrivalTime:`${base}15:45:00`, returnDepartureTime: returnDate?`${returnDate}T07:00:00`:null, returnArrivalTime: returnDate?`${returnDate}T12:30:00`:null, bookingLink:buildBookingLink(origin,destination,dep,returnDate), isBestDeal:false },
    { id:'mock-5', price:275.60, currency:'USD', airline:'Delta Air Lines',      airlineCode:'DL', stops:1, totalTravelMinutes:210, layoverMinutes:60,  departureTime:`${base}10:00:00`, arrivalTime:`${base}13:30:00`, returnDepartureTime: returnDate?`${returnDate}T09:45:00`:null, returnArrivalTime: returnDate?`${returnDate}T15:15:00`:null, bookingLink:buildBookingLink(origin,destination,dep,returnDate), isBestDeal:false },
  ];

  mock.sort((a, b) => a.price - b.price);
  return markBestDeal(mock);
}

// ---------------------------------------------------------------------------
// searchFlights — public API
// ---------------------------------------------------------------------------

/**
 * searchFlights(origin, destination, departDate, returnDate, adults)
 *
 * Searches Sky-Scrapper (RapidAPI) for real-time flight offers.
 * Falls back to mock data when the API key is absent or the call fails.
 *
 * @param {string}      origin      - IATA code, e.g. "CLE"
 * @param {string}      destination - IATA code, e.g. "HOU"
 * @param {string}      departDate  - "YYYY-MM-DD"
 * @param {string|null} returnDate  - "YYYY-MM-DD" or null for one-way
 * @param {number}      adults      - Passenger count
 * @returns {Promise<object[]>}
 */
async function searchFlights(origin, destination, departDate, returnDate = null, adults = 1) {
  if (!RAPIDAPI_KEY) {
    console.log('[Flights] No API key — returning mock data.');
    return getMockFlights(origin, destination, departDate, returnDate);
  }

  try {
    // Resolve IATA codes → Sky-Scrapper entity IDs (run in parallel)
    const [originId, destinationId] = await Promise.all([
      getEntityId(origin),
      getEntityId(destination),
    ]);

    console.log(`[Flights] Searching ${origin}(${originId}) → ${destination}(${destinationId}) on ${departDate}`);

    const itineraries = await fetchFlights(originId, destinationId, departDate, returnDate, adults);

    if (!itineraries || itineraries.length === 0) {
      console.warn('[Flights] API returned no itineraries — falling back to mock data.');
      return getMockFlights(origin, destination, departDate, returnDate);
    }

    const flights = itineraries
      .map((it, i) => transformItinerary(it, origin, destination, departDate, returnDate, i))
      .filter(Boolean);

    flights.sort((a, b) => a.price - b.price);
    return markBestDeal(flights);

  } catch (err) {
    console.error('[Flights] API error:', err.response?.data || err.message);
    return getMockFlights(origin, destination, departDate, returnDate);
  }
}

module.exports = { searchFlights };
