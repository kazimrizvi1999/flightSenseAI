import { useState, useEffect } from 'react'
import {
  User,
  MapPin,
  DollarSign,
  Clock,
  Plane,
  Bell,
  Save,
  X,
  Plus,
  Mail,
  Smartphone,
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const val = input.trim().toUpperCase()
    if (val && !tags.includes(val)) {
      onChange([...tags, val])
    }
    setInput('')
  }

  const removeTag = (tag) => onChange(tags.filter((t) => t !== tag))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-medium px-2.5 py-1 rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-blue-400 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
          className="input-dark flex-1"
        />
        <button
          type="button"
          onClick={addTag}
          className="w-10 h-10 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card-dark">
      <h2 className="text-white font-semibold flex items-center gap-2 mb-5 pb-4 border-b border-gray-800">
        <Icon className="w-5 h-5 text-blue-400" />
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState({
    homeAirport: 'CLE',
    budgetMin: '',
    budgetMax: '',
    maxLayover: 6,
    preferredAirlines: [],
    blacklistedAirlines: [],
    notifyEmail: true,
    notifyPush: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .get('/users/preferences')
      .then(({ data }) => {
        setPrefs((p) => ({
          ...p,
          homeAirport: data.homeAirport || 'CLE',
          budgetMin: data.budgetMin ?? '',
          budgetMax: data.budgetMax ?? '',
          maxLayover: data.maxLayover ?? 6,
          preferredAirlines: data.preferredAirlines || [],
          blacklistedAirlines: data.blacklistedAirlines || [],
          notifyEmail: data.notifyEmail ?? true,
          notifyPush: data.notifyPush ?? false,
        }))
      })
      .catch(() => {
        // use defaults silently
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/users/preferences', {
        homeAirport: prefs.homeAirport.trim().toUpperCase(),
        budgetMin: prefs.budgetMin ? parseFloat(prefs.budgetMin) : undefined,
        budgetMax: prefs.budgetMax ? parseFloat(prefs.budgetMax) : undefined,
        maxLayover: prefs.maxLayover,
        preferredAirlines: prefs.preferredAirlines,
        blacklistedAirlines: prefs.blacklistedAirlines,
        notifyEmail: prefs.notifyEmail,
        notifyPush: prefs.notifyPush,
      })
      toast.success('Preferences saved!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-[#0d1526] border border-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center text-2xl font-bold text-white uppercase shadow-lg shadow-blue-500/20">
          {user?.name?.[0] || user?.email?.[0] || 'U'}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{user?.name || 'My Profile'}</h1>
          <p className="text-gray-400 text-sm">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Travel Preferences */}
        <Section icon={MapPin} title="Travel Preferences">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5">
              Home Airport
            </label>
            <input
              value={prefs.homeAirport}
              onChange={(e) => setPrefs((p) => ({ ...p, homeAirport: e.target.value }))}
              placeholder="e.g. CLE"
              maxLength={3}
              className="input-dark uppercase w-32 font-semibold tracking-widest"
            />
            <p className="text-gray-600 text-xs mt-1">Used as default search origin</p>
          </div>

          {/* Budget range */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5">
              Budget Range (per person)
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="number"
                  value={prefs.budgetMin}
                  onChange={(e) => setPrefs((p) => ({ ...p, budgetMin: e.target.value }))}
                  placeholder="Min"
                  min="0"
                  className="input-dark pl-8"
                />
              </div>
              <span className="text-gray-600 flex-shrink-0">—</span>
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="number"
                  value={prefs.budgetMax}
                  onChange={(e) => setPrefs((p) => ({ ...p, budgetMax: e.target.value }))}
                  placeholder="Max"
                  min="0"
                  className="input-dark pl-8"
                />
              </div>
            </div>
          </div>

          {/* Max layover */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-gray-300 text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-500" />
                Max Layover Duration
              </label>
              <span className="text-blue-400 font-bold text-sm">
                {prefs.maxLayover === 0 ? 'No layover' : `${prefs.maxLayover} hour${prefs.maxLayover !== 1 ? 's' : ''}`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={prefs.maxLayover}
              onChange={(e) => setPrefs((p) => ({ ...p, maxLayover: parseInt(e.target.value) }))}
              className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-gray-600 text-xs mt-1">
              <span>Nonstop only</span>
              <span>12 hours</span>
            </div>
          </div>
        </Section>

        {/* Airline Preferences */}
        <Section icon={Plane} title="Airline Preferences">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Preferred Airlines
            </label>
            <TagInput
              tags={prefs.preferredAirlines}
              onChange={(val) => setPrefs((p) => ({ ...p, preferredAirlines: val }))}
              placeholder="Type airline name, press Enter"
            />
            <p className="text-gray-600 text-xs mt-1">
              These airlines will be highlighted in search results
            </p>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Blacklisted Airlines
            </label>
            <TagInput
              tags={prefs.blacklistedAirlines}
              onChange={(val) => setPrefs((p) => ({ ...p, blacklistedAirlines: val }))}
              placeholder="Type airline to exclude, press Enter"
            />
            <p className="text-gray-600 text-xs mt-1">
              These airlines will be hidden from search results
            </p>
          </div>
        </Section>

        {/* Notifications */}
        <Section icon={Bell} title="Notifications">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600/10 border border-blue-500/20 rounded-lg flex items-center justify-center">
                  <Mail className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Email Notifications</p>
                  <p className="text-gray-500 text-xs">Get alerts sent to {user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, notifyEmail: !p.notifyEmail }))}
                className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${
                  prefs.notifyEmail ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                    prefs.notifyEmail ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-cyan-600/10 border border-cyan-500/20 rounded-lg flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Push Notifications</p>
                  <p className="text-gray-500 text-xs">Browser push notifications for deals</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, notifyPush: !p.notifyPush }))}
                className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${
                  prefs.notifyPush ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                    prefs.notifyPush ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </Section>

        {/* Account info */}
        <Section icon={User} title="Account">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400 text-sm">Name</span>
              <span className="text-white text-sm font-medium">{user?.name || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400 text-sm">Email</span>
              <span className="text-white text-sm font-medium">{user?.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-gray-400 text-sm">Member since</span>
              <span className="text-white text-sm font-medium">
                {user?.createdAt
                  ? format(new Date(user.createdAt), 'MMM d, yyyy')
                  : '—'}
              </span>
            </div>
          </div>
        </Section>

        {/* Save */}
        <div className="sticky bottom-0 pb-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base shadow-lg shadow-blue-600/20"
          >
            {saving ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Preferences
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
