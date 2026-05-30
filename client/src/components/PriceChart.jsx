import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import api from '../api/axios'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0d1526] border border-gray-700 rounded-xl p-3 shadow-xl">
        <p className="text-gray-400 text-xs mb-1">{label}</p>
        <p className="text-white font-bold">${payload[0].value?.toLocaleString()}</p>
      </div>
    )
  }
  return null
}

export default function PriceChart({ route, compact = false }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!route) return
    setLoading(true)
    api
      .get(`/priceHistory/${route}`)
      .then(({ data: raw }) => {
        const formatted = (raw || []).map((item) => ({
          date: item.date
            ? format(new Date(item.date), 'MMM d')
            : '—',
          price: item.price,
        }))
        setData(formatted)
      })
      .catch(() => setError('Unable to load price history'))
      .finally(() => setLoading(false))
  }, [route])

  const trendEmoji = () => {
    if (data.length < 2) return null
    const first = data[0].price
    const last = data[data.length - 1].price
    const pct = ((last - first) / first) * 100
    if (pct < -5)
      return (
        <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
          <TrendingDown className="w-3.5 h-3.5" /> Down {Math.abs(pct).toFixed(1)}%
        </span>
      )
    if (pct > 5)
      return (
        <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
          <TrendingUp className="w-3.5 h-3.5" /> Up {pct.toFixed(1)}%
        </span>
      )
    return (
      <span className="flex items-center gap-1 text-gray-400 text-xs font-semibold">
        <Minus className="w-3.5 h-3.5" /> Stable
      </span>
    )
  }

  if (loading)
    return (
      <div
        className={`bg-[#111827] rounded-xl animate-pulse ${
          compact ? 'h-20' : 'h-40'
        }`}
      />
    )
  if (error || data.length === 0)
    return (
      <div
        className={`bg-[#111827] rounded-xl flex items-center justify-center ${
          compact ? 'h-20' : 'h-40'
        }`}
      >
        <p className="text-gray-600 text-xs">No price history available</p>
      </div>
    )

  return (
    <div>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-400 text-xs">30-day price trend</p>
          {trendEmoji()}
        </div>
      )}
      <ResponsiveContainer width="100%" height={compact ? 60 : 160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          {!compact && (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
            </>
          )}
          <Line
            type="monotone"
            dataKey="price"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={compact ? false : { r: 4, fill: '#3b82f6', stroke: '#0d1526', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
