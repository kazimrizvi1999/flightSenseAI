import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  SlidersHorizontal,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import FlightCard from '../components/FlightCard'
import AlertModal from '../components/AlertModal'
import AIChatWidget from '../components/AIChatWidget'

const today = new Date().toISOString().split('T')[0]

const SkeletonCard = () => (
  <div className="bg-[#0d1526] border border-gray-800 rounded-xl p-5 animate-pulse">
    <div className="flex gap-4">
      <div className="w-10 h-10 bg-gray-800 rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-800 rounded w-1/3" />
        <div className="h-3 bg-gray-800 rounded w-1/4" />
      </div>
      <div className="w-24 space-y-2">
        <div className="h-6 bg-gray-800 rounded" />
        <div className="h-4 bg-gray-800 rounded" />
      </div>
    </div>
    <div className="mt-4 h-px bg-gray-800" />
    <div className="mt-4 flex items-center gap-4">
      <div className="h-8 bg-gray-800 rounded flex-1" />
      <div className="h-8 bg-gray-800 rounded w-24" />
    </div>
  </div>
)

function FilterSidebar({ filters, setFilters, airlines, collapsed, onToggle }) {
  return (
    <div className="bg-[#0d1526] border border-gray-800 rounded-xl">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-3 md:cursor-default"
      >
        <span className="text-white font-semibold flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-400" />
          Filters
        </span>
        <span className="md:hidden text-gray-400">
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </span>
      </button>

      <div className={`px-4 pb-5 space-y-5 ${collapsed ? 'hidden md:block' : ''}`}>
        {/* Max price */}
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Max Price</label>
            <span className="text-blue-400 text-sm font-bold">${filters.maxPrice}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2000}
            step={50}
            value={filters.maxPrice}
            onChange={(e) => setFilters((f) => ({ ...f, maxPrice: parseInt(e.target.value) }))}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-gray-600 text-xs mt-1">
            <span>$0</span>
            <span>$2000</span>
          </div>
        </div>

        {/* Max stops */}
        <div>
          <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
            Max Stops
          </label>
          <div className="space-y-1.5">
            {[
              { val: 99, label: 'Any' },
              { val: 0, label: 'Nonstop only' },
              { val: 1, label: 'Up to 1 stop' },
              { val: 2, label: '2+ stops' },
            ].map(({ val, label }) => (
              <label
                key={val}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                    filters.maxStops === val
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-600 group-hover:border-gray-400'
                  }`}
                  onClick={() => setFilters((f) => ({ ...f, maxStops: val }))}
                >
                  {filters.maxStops === val && (
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    filters.maxStops === val ? 'text-white' : 'text-gray-400'
                  } cursor-pointer`}
                  onClick={() => setFilters((f) => ({ ...f, maxStops: val }))}
                >
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Max layover */}
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">
              Max Layover
            </label>
            <span className="text-blue-400 text-sm font-bold">{filters.maxLayover}h</span>
          </div>
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={filters.maxLayover}
            onChange={(e) => setFilters((f) => ({ ...f, maxLayover: parseInt(e.target.value) }))}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-gray-600 text-xs mt-1">
            <span>0h</span>
            <span>12h</span>
          </div>
        </div>

        {/* Airlines */}
        {airlines.length > 0 && (
          <div>
            <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
              Airlines
            </label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {airlines.map((airline) => (
                <label
                  key={airline}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={filters.airlines.includes(airline)}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        airlines: e.target.checked
                          ? [...f.airlines, airline]
                          : f.airlines.filter((a) => a !== airline),
                      }))
                    }
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">
                    {airline}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AIRecommendations({ recommendations }) {
  if (!recommendations || recommendations.length === 0) return null
  return (
    <div className="mt-6 bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border border-blue-500/30 rounded-2xl p-5">
      <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-yellow-400" />
        FlightSense AI Recommendations
      </h3>
      <div className="grid gap-4 sm:grid-cols-3">
        {recommendations.slice(0, 3).map((rec, i) => (
          <div
            key={i}
            className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
                {i + 1}
              </div>
              <p className="text-white font-semibold text-sm">
                {rec.airline || 'Top Pick'}
              </p>
              {rec.price && (
                <p className="text-cyan-400 font-bold text-sm ml-auto">${rec.price}</p>
              )}
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              {rec.reasoning || rec.reason || 'Best value for your preferences.'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({
    origin: searchParams.get('origin') || 'CLE',
    destination: searchParams.get('destination') || '',
    departDate: searchParams.get('departDate') || '',
    returnDate: '',
    passengers: 1,
  })
  const [results, setResults] = useState([])
  const [aiRecs, setAiRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [sortBy, setSortBy] = useState('price')
  const [filters, setFilters] = useState({
    maxPrice: 2000,
    maxStops: 99,
    maxLayover: 12,
    airlines: [],
  })
  const [filterCollapsed, setFilterCollapsed] = useState(true)
  const [alertModal, setAlertModal] = useState({ open: false, flight: null })

  const availableAirlines = [...new Set(results.map((f) => f.airline).filter(Boolean))]

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!form.origin || !form.destination) {
      toast.error('Enter both origin and destination')
      return
    }
    setLoading(true)
    setSearched(true)
    setResults([])
    setAiRecs([])
    try {
      const params = new URLSearchParams({
        origin: form.origin.toUpperCase(),
        destination: form.destination.toUpperCase(),
        ...(form.departDate && { departDate: form.departDate }),
        ...(form.returnDate && { returnDate: form.returnDate }),
        passengers: form.passengers,
      })
      const { data } = await api.get(`/flights/search?${params}`)
      const flights = data.flights || data || []
      setResults(flights)
      if (data.aiRecommendations) setAiRecs(data.aiRecommendations)
      if (flights.length === 0) toast('No flights found for that route', { icon: '✈' })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-search if params in URL
  useEffect(() => {
    if (searchParams.get('origin') && searchParams.get('destination')) {
      handleSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredResults = results
    .filter((f) => {
      if (f.price > filters.maxPrice) return false
      if (filters.maxStops !== 99 && (f.stops ?? 0) > filters.maxStops) return false
      if (filters.maxLayover < 12 && f.layoverDuration > filters.maxLayover * 60) return false
      if (filters.airlines.length > 0 && !filters.airlines.includes(f.airline)) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'price') return (a.price || 0) - (b.price || 0)
      if (sortBy === 'time') return (a.durationMinutes || 0) - (b.durationMinutes || 0)
      if (sortBy === 'stops') return (a.stops || 0) - (b.stops || 0)
      return 0
    })

  const openAlertModal = (flight) => setAlertModal({ open: true, flight })

  return (
    <div className="px-4 py-6 md:px-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Search Flights</h1>
        <p className="text-gray-400 text-sm">Find the best deals powered by AI</p>
      </div>

      {/* Search form */}
      <form
        onSubmit={handleSearch}
        className="bg-[#0d1526] border border-gray-800 rounded-2xl p-5 mb-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <label className="block text-gray-400 text-xs mb-1.5 font-medium">From</label>
            <input
              value={form.origin}
              onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
              placeholder="CLE"
              maxLength={3}
              className="input-dark uppercase font-semibold tracking-wider"
              required
            />
          </div>
          <div className="relative">
            <label className="block text-gray-400 text-xs mb-1.5 font-medium">To</label>
            <input
              value={form.destination}
              onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              placeholder="JFK"
              maxLength={3}
              className="input-dark uppercase font-semibold tracking-wider"
              required
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5 font-medium">Depart</label>
            <input
              type="date"
              value={form.departDate}
              onChange={(e) => setForm((f) => ({ ...f, departDate: e.target.value }))}
              min={today}
              className="input-dark"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5 font-medium">Return</label>
            <input
              type="date"
              value={form.returnDate}
              onChange={(e) => setForm((f) => ({ ...f, returnDate: e.target.value }))}
              min={form.departDate || today}
              className="input-dark"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5 font-medium">Passengers</label>
            <select
              value={form.passengers}
              onChange={(e) => setForm((f) => ({ ...f, passengers: parseInt(e.target.value) }))}
              className="input-dark"
            >
              {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'Adult' : 'Adults'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2 px-8">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search Flights
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results area */}
      {(searched || results.length > 0) && (
        <div className="flex flex-col md:flex-row gap-5">
          {/* Filter sidebar */}
          <div className="md:w-56 flex-shrink-0">
            <FilterSidebar
              filters={filters}
              setFilters={setFilters}
              airlines={availableAirlines}
              collapsed={filterCollapsed}
              onToggle={() => setFilterCollapsed((c) => !c)}
            />
          </div>

          {/* Results */}
          <div className="flex-1 min-w-0">
            {/* Sort tabs */}
            {!loading && filteredResults.length > 0 && (
              <div className="flex items-center gap-1 mb-4 bg-[#0d1526] border border-gray-800 rounded-xl p-1 w-fit">
                {['price', 'time', 'stops'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                      sortBy === s
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {s === 'time' ? 'Duration' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {/* Count */}
            {!loading && searched && (
              <p className="text-gray-400 text-sm mb-4">
                {filteredResults.length} flight{filteredResults.length !== 1 ? 's' : ''} found
                {results.length !== filteredResults.length && (
                  <span className="text-gray-600"> (filtered from {results.length})</span>
                )}
              </p>
            )}

            {/* Skeletons */}
            {loading && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
              </div>
            )}

            {/* Flight cards */}
            {!loading && filteredResults.length > 0 && (
              <div className="space-y-4">
                {filteredResults.map((flight, i) => (
                  <FlightCard
                    key={flight._id || flight.id || i}
                    flight={flight}
                    onSetAlert={openAlertModal}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && searched && filteredResults.length === 0 && (
              <div className="text-center py-16 bg-[#0d1526] border border-gray-800 rounded-xl">
                <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-gray-300 font-semibold mb-2">No flights found</p>
                <p className="text-gray-500 text-sm">
                  Try adjusting your filters or search for a different route.
                </p>
                <button
                  onClick={() =>
                    setFilters({ maxPrice: 2000, maxStops: 99, maxLayover: 12, airlines: [] })
                  }
                  className="mt-4 text-blue-400 text-sm hover:underline"
                >
                  Reset filters
                </button>
              </div>
            )}

            {/* AI Recommendations */}
            <AIRecommendations recommendations={aiRecs} />
          </div>
        </div>
      )}

      {/* Alert modal */}
      <AlertModal
        isOpen={alertModal.open}
        onClose={() => setAlertModal({ open: false, flight: null })}
        onSaved={() => toast.success('Price alert created!')}
        editAlert={
          alertModal.flight
            ? {
                origin: alertModal.flight.origin || form.origin,
                destinations: [alertModal.flight.destination || form.destination],
                max_price: alertModal.flight.price ? Math.round(alertModal.flight.price * 1.1) : '',
                max_stops: alertModal.flight.stops ?? 2,
              }
            : null
        }
      />

      {/* AI Chat Widget */}
      <AIChatWidget
        flightContext={
          results.length > 0
            ? {
                origin: form.origin,
                destination: form.destination,
                flightCount: results.length,
                lowestPrice: Math.min(...results.map((f) => f.price || Infinity)),
              }
            : null
        }
      />
    </div>
  )
}
