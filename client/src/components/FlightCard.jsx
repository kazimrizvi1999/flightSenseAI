import { Plane, Clock, Star, ExternalLink, Bell, ArrowRight } from 'lucide-react'

function formatTime(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export default function FlightCard({ flight, onSetAlert }) {
  const {
    airline,
    departureTime,
    arrivalTime,
    durationMinutes,
    stops = 0,
    layoverDuration,
    price,
    bookingLink,
    isBestDeal,
    aiScore,
  } = flight

  const stopsLabel =
    stops === 0 ? 'Nonstop' : stops === 1 ? '1 stop' : `${stops} stops`

  return (
    <div
      className={`relative bg-[#0d1526] border rounded-xl p-5 transition-all hover:border-blue-500/40 ${
        isBestDeal
          ? 'border-blue-500/50 shadow-lg shadow-blue-500/10'
          : 'border-gray-800'
      }`}
    >
      {/* Best deal badge */}
      {isBestDeal && (
        <div className="absolute -top-3 left-4">
          <span className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
            <Star className="w-3 h-3" />
            BEST DEAL
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Airline */}
        <div className="flex items-center gap-3 sm:w-40 flex-shrink-0">
          <div className="w-10 h-10 bg-[#111827] border border-gray-700 rounded-lg flex items-center justify-center">
            <Plane className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{airline || 'Unknown'}</p>
            {aiScore && (
              <p className="text-cyan-400 text-xs font-medium">Score: {aiScore}</p>
            )}
          </div>
        </div>

        {/* Flight timeline */}
        <div className="flex-1 flex items-center gap-3">
          <div className="text-center">
            <p className="text-white text-xl font-bold">{formatTime(departureTime)}</p>
            <p className="text-gray-500 text-xs">{flight.origin || ''}</p>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="flex items-center w-full gap-1">
              <div className="h-px flex-1 bg-gray-700" />
              <Plane className="w-3.5 h-3.5 text-blue-400 rotate-0" />
              <div className="h-px flex-1 bg-gray-700" />
            </div>
            <p className="text-gray-500 text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(durationMinutes)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-white text-xl font-bold">{formatTime(arrivalTime)}</p>
            <p className="text-gray-500 text-xs">{flight.destination || ''}</p>
          </div>
        </div>

        {/* Stops info */}
        <div className="hidden md:block text-center sm:w-28 flex-shrink-0">
          <p
            className={`text-sm font-semibold ${
              stops === 0 ? 'text-green-400' : stops === 1 ? 'text-yellow-400' : 'text-orange-400'
            }`}
          >
            {stopsLabel}
          </p>
          {layoverDuration > 0 && (
            <p className="text-gray-500 text-xs mt-0.5">
              {formatDuration(layoverDuration)} layover
            </p>
          )}
        </div>

        {/* Price + actions */}
        <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 justify-between sm:justify-start sm:w-36 flex-shrink-0">
          <div className="text-right">
            <p className="text-2xl font-bold text-white">${price?.toLocaleString() ?? '—'}</p>
            <p className="text-gray-500 text-xs">per person</p>
          </div>
          <div className="flex sm:flex-col gap-2 w-auto sm:w-full">
            <button
              onClick={() => onSetAlert && onSetAlert(flight)}
              className="flex items-center gap-1.5 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold px-3 py-2 rounded-lg transition-all whitespace-nowrap"
            >
              <Bell className="w-3 h-3" />
              Set Alert
            </button>
            {bookingLink ? (
              <a
                href={bookingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                Book
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors whitespace-nowrap">
                Book
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile stops */}
      <div className="mt-3 flex items-center gap-2 sm:hidden">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            stops === 0
              ? 'bg-green-900/40 text-green-400'
              : stops === 1
              ? 'bg-yellow-900/40 text-yellow-400'
              : 'bg-orange-900/40 text-orange-400'
          }`}
        >
          {stopsLabel}
        </span>
        {layoverDuration > 0 && (
          <span className="text-gray-500 text-xs">{formatDuration(layoverDuration)} layover</span>
        )}
      </div>
    </div>
  )
}
