import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  TrendingDown,
  MapPin,
  Calendar,
  Search,
  ArrowRight,
  Plane,
  Clock,
  DollarSign,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-600/10 border-blue-500/20 text-blue-400',
    cyan: 'bg-cyan-600/10 border-cyan-500/20 text-cyan-400',
    green: 'bg-green-600/10 border-green-500/20 text-green-400',
    purple: 'bg-purple-600/10 border-purple-500/20 text-purple-400',
  }
  return (
    <div className="card-dark flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function DealCard({ alert }) {
  const change = alert.creation_price && alert.current_price
    ? (((alert.current_price - alert.creation_price) / alert.creation_price) * 100).toFixed(1)
    : null

  return (
    <div className="flex items-center justify-between p-4 bg-[#111827] rounded-xl border border-gray-800/60 hover:border-blue-500/30 transition-all group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-blue-600/15 rounded-lg flex items-center justify-center flex-shrink-0">
          <Plane className="w-4 h-4 text-blue-400" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {alert.origin} → {Array.isArray(alert.destinations) ? alert.destinations.join(', ') : alert.destinations}
          </p>
          <p className="text-gray-500 text-xs truncate">
            Max ${alert.max_price} · {alert.max_stops === 0 ? 'Nonstop' : `Up to ${alert.max_stops} stop${alert.max_stops > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-4">
        {alert.current_price ? (
          <>
            <p className="text-white font-bold">${alert.current_price}</p>
            {change !== null && (
              <p className={`text-xs font-medium ${parseFloat(change) < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(change) < 0 ? '↓' : '↑'} {Math.abs(change)}%
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-xs">Monitoring...</p>
        )}
      </div>
    </div>
  )
}

function HistoryItem({ item }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/search?origin=${item.origin}&destination=${item.destination}`)}
      className="flex items-center justify-between w-full p-3 bg-[#111827] rounded-xl border border-gray-800/60 hover:border-blue-500/30 transition-all group text-left"
    >
      <div className="flex items-center gap-3">
        <Clock className="w-4 h-4 text-gray-500" />
        <div>
          <p className="text-white text-sm font-medium">
            {item.origin} → {item.destination}
          </p>
          <p className="text-gray-500 text-xs">
            {item.searched_at ? format(new Date(item.searched_at), 'MMM d, yyyy') : 'Recent'}
          </p>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
    </button>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [history, setHistory] = useState([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [quickSearch, setQuickSearch] = useState({ origin: '', destination: '' })

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await api.get('/alerts')
        setAlerts((data || []).filter((a) => a.status === 'active').slice(0, 4))
      } catch {
        // silently fail
      } finally {
        setLoadingAlerts(false)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await api.get('/flights/history')
        setHistory((data || []).slice(0, 5))
      } catch {
        // silently fail
      } finally {
        setLoadingHistory(false)
      }
    }
    fetchHistory()
  }, [])

  const handleQuickSearch = (e) => {
    e.preventDefault()
    if (!quickSearch.origin || !quickSearch.destination) {
      toast.error('Enter both origin and destination')
      return
    }
    navigate(`/search?origin=${quickSearch.origin.toUpperCase()}&destination=${quickSearch.destination.toUpperCase()}`)
  }

  const activeAlerts = alerts.length
  const cheapest = alerts.reduce((min, a) => {
    if (a.current_price && (!min || a.current_price < min)) return a.current_price
    return min
  }, null)

  return (
    <div className="px-4 py-6 md:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {greeting()}, {user?.name?.split(' ')[0] || 'Traveler'} ✈
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <Link
          to="/alerts"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors self-start sm:self-auto"
        >
          <Bell className="w-4 h-4" />
          Manage Alerts
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Bell}
          label="Active Alerts"
          value={loadingAlerts ? '—' : activeAlerts}
          sub="Monitoring prices"
          color="blue"
        />
        <StatCard
          icon={TrendingDown}
          label="Deals Found"
          value="—"
          sub="This week"
          color="green"
        />
        <StatCard
          icon={DollarSign}
          label="Cheapest Route"
          value={cheapest ? `$${cheapest}` : '—'}
          sub="Current best price"
          color="cyan"
        />
        <StatCard
          icon={Calendar}
          label="Next Trip"
          value="—"
          sub="No upcoming trips"
          color="purple"
        />
      </div>

      {/* Quick search */}
      <div className="card-dark mb-8">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-400" />
          Quick Search
        </h2>
        <form onSubmit={handleQuickSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={quickSearch.origin}
              onChange={(e) => setQuickSearch((s) => ({ ...s, origin: e.target.value }))}
              placeholder="Origin (e.g. CLE)"
              maxLength={3}
              className="input-dark pl-9 uppercase"
            />
          </div>
          <div className="relative flex-1">
            <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={quickSearch.destination}
              onChange={(e) => setQuickSearch((s) => ({ ...s, destination: e.target.value }))}
              placeholder="Destination (e.g. JFK)"
              maxLength={3}
              className="input-dark pl-9 uppercase"
            />
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2 whitespace-nowrap">
            <Search className="w-4 h-4" />
            Search Flights
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Deals */}
        <div className="card-dark">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              Top Deals Right Now
            </h2>
            <Link to="/alerts" className="text-blue-400 text-xs hover:text-blue-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingAlerts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-[#111827] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No active alerts yet</p>
              <Link to="/alerts" className="text-blue-400 text-sm hover:underline mt-1 inline-block">
                Create your first alert →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <DealCard key={alert._id || alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Searches */}
        <div className="card-dark">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Recent Searches
            </h2>
            <button
              onClick={() => {
                setLoadingHistory(true)
                api.get('/flights/history').then(({ data }) => {
                  setHistory((data || []).slice(0, 5))
                }).catch(() => {}).finally(() => setLoadingHistory(false))
              }}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-[#111827] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <Search className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No recent searches</p>
              <Link to="/search" className="text-blue-400 text-sm hover:underline mt-1 inline-block">
                Search flights →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item, i) => (
                <HistoryItem key={i} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
