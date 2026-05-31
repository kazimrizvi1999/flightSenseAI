import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  Plus,
  Trash2,
  Pause,
  Play,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Plane,
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../api/axios'
import toast from 'react-hot-toast'
import AlertModal from '../components/AlertModal'
import PriceChart from '../components/PriceChart'

function StatusBadge({ status }) {
  const map = {
    active: 'badge-active',
    paused: 'badge-paused',
    triggered: 'badge-triggered',
  }
  return (
    <span className={map[status] || 'badge-paused'}>
      {status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown'}
    </span>
  )
}

function AlertCard({ alert, onToggle, onDelete, onEdit }) {
  const [showChart, setShowChart] = useState(false)
  const route =
    alert.origin && Array.isArray(alert.destinations)
      ? `${alert.origin}-${alert.destinations[0]}`
      : null

  const pctChange =
    alert.creation_price && alert.current_price
      ? (((alert.current_price - alert.creation_price) / alert.creation_price) * 100).toFixed(1)
      : null

  return (
    <div className="bg-[#0d1526] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Route info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Plane className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-white font-semibold">
                {alert.origin} → {Array.isArray(alert.destinations) ? alert.destinations.join(' / ') : alert.destinations}
              </h3>
              <StatusBadge status={alert.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>Max ${alert.max_price?.toLocaleString()}</span>
              <span>
                {alert.max_stops === 0
                  ? 'Nonstop'
                  : alert.max_stops === 1
                  ? 'Max 1 stop'
                  : 'Any stops'}
              </span>
              {alert.departDateStart && (
                <span>
                  {format(new Date(alert.departDateStart), 'MMM d')}
                  {alert.departDateEnd && ` – ${format(new Date(alert.departDateEnd), 'MMM d')}`}
                </span>
              )}
              {alert.last_checked && (
                <span>
                  Checked {format(new Date(alert.last_checked), 'MMM d, h:mm a')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-center gap-4 sm:flex-col sm:items-end">
          {alert.current_price ? (
            <div className="text-right">
              <p className="text-2xl font-bold text-white">${alert.current_price.toLocaleString()}</p>
              {pctChange !== null && (
                <p
                  className={`text-xs font-semibold flex items-center gap-0.5 justify-end ${
                    parseFloat(pctChange) < 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {parseFloat(pctChange) < 0 ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : (
                    <TrendingUp className="w-3 h-3" />
                  )}
                  {parseFloat(pctChange) < 0 ? '' : '+'}
                  {pctChange}% from start
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Monitoring...</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggle(alert)}
              title={alert.status === 'active' ? 'Pause alert' : 'Resume alert'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                alert.status === 'active'
                  ? 'bg-yellow-900/20 hover:bg-yellow-900/40 text-yellow-400'
                  : 'bg-green-900/20 hover:bg-green-900/40 text-green-400'
              }`}
            >
              {alert.status === 'active' ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => onEdit(alert)}
              className="w-8 h-8 rounded-lg bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 flex items-center justify-center transition-all"
              title="Edit alert"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(alert)}
              className="w-8 h-8 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 flex items-center justify-center transition-all"
              title="Delete alert"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Price chart toggle */}
      {route && (
        <div className="mt-4">
          <button
            onClick={() => setShowChart((s) => !s)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            {showChart ? '▲ Hide' : '▼ Show'} price trend
          </button>
          {showChart && (
            <div className="mt-3">
              <PriceChart route={route} compact={false} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open: false, alert: null })
  const [filter, setFilter] = useState('all')

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/alerts')
      setAlerts(data.alerts || data || [])
    } catch {
      toast.error('Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const handleToggle = async (alert) => {
    const newStatus = alert.status === 'active' ? 'paused' : 'active'
    try {
      await api.put(`/alerts/${alert._id || alert.id}`, { status: newStatus })
      setAlerts((a) =>
        a.map((al) =>
          (al._id || al.id) === (alert._id || alert.id) ? { ...al, status: newStatus } : al
        )
      )
      toast.success(`Alert ${newStatus === 'active' ? 'resumed' : 'paused'}`)
    } catch {
      toast.error('Failed to update alert')
    }
  }

  const handleDelete = async (alert) => {
    if (!confirm('Delete this alert?')) return
    try {
      await api.delete(`/alerts/${alert._id || alert.id}`)
      setAlerts((a) => a.filter((al) => (al._id || al.id) !== (alert._id || alert.id)))
      toast.success('Alert deleted')
    } catch {
      toast.error('Failed to delete alert')
    }
  }

  const filtered = alerts.filter((a) => {
    if (filter === 'all') return true
    return a.status === filter
  })

  const counts = {
    all: alerts.length,
    active: alerts.filter((a) => a.status === 'active').length,
    paused: alerts.filter((a) => a.status === 'paused').length,
    triggered: alerts.filter((a) => a.status === 'triggered').length,
  }

  return (
    <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-400" />
            Price Alerts
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Get notified when prices drop below your target
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, alert: null })}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Alert
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[#0d1526] border border-gray-800 rounded-xl p-1 mb-6 w-fit">
        {Object.entries(counts).map(([key, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {key} {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-[#0d1526] border border-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-[#0d1526] border border-gray-800 rounded-xl">
          {alerts.length === 0 ? (
            <>
              <Bell className="w-14 h-14 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-300 font-semibold text-lg mb-2">No alerts yet</p>
              <p className="text-gray-500 text-sm mb-6">
                Create your first alert to start tracking flight prices
              </p>
              <button
                onClick={() => setModal({ open: true, alert: null })}
                className="btn-primary"
              >
                Create First Alert
              </button>
            </>
          ) : (
            <>
              <AlertCircle className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">No {filter} alerts</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((alert) => (
            <AlertCard
              key={alert._id || alert.id}
              alert={alert}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={(a) => setModal({ open: true, alert: a })}
            />
          ))}
        </div>
      )}

      {/* Stats summary */}
      {alerts.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="card-dark text-center">
            <p className="text-2xl font-bold text-blue-400">{counts.active}</p>
            <p className="text-gray-500 text-xs mt-1">Active</p>
          </div>
          <div className="card-dark text-center">
            <p className="text-2xl font-bold text-yellow-400">{counts.paused}</p>
            <p className="text-gray-500 text-xs mt-1">Paused</p>
          </div>
          <div className="card-dark text-center">
            <p className="text-2xl font-bold text-green-400">{counts.triggered}</p>
            <p className="text-gray-500 text-xs mt-1">Triggered</p>
          </div>
        </div>
      )}

      {/* Modal */}
      <AlertModal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, alert: null })}
        onSaved={fetchAlerts}
        editAlert={modal.alert}
      />
    </div>
  )
}
