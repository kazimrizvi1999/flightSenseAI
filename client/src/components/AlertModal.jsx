import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Bell } from 'lucide-react'
import api from '../api/axios'
import toast from 'react-hot-toast'

const defaultForm = {
  origin: '',
  destinations: [''],
  departDateStart: '',
  departDateEnd: '',
  maxPrice: '',
  maxStops: 2,
}

export default function AlertModal({ isOpen, onClose, onSaved, editAlert = null }) {
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editAlert) {
      setForm({
        origin: editAlert.origin || '',
        destinations: Array.isArray(editAlert.destinations)
          ? editAlert.destinations
          : [editAlert.destinations || ''],
        departDateStart: editAlert.departDateStart?.slice(0, 10) || '',
        departDateEnd: editAlert.departDateEnd?.slice(0, 10) || '',
        maxPrice: editAlert.max_price || '',
        maxStops: editAlert.max_stops ?? 2,
      })
    } else {
      setForm(defaultForm)
    }
  }, [editAlert, isOpen])

  if (!isOpen) return null

  const setDest = (idx, val) => {
    setForm((f) => {
      const d = [...f.destinations]
      d[idx] = val
      return { ...f, destinations: d }
    })
  }

  const addDest = () =>
    setForm((f) => ({ ...f, destinations: [...f.destinations, ''] }))

  const removeDest = (idx) =>
    setForm((f) => ({
      ...f,
      destinations: f.destinations.filter((_, i) => i !== idx),
    }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const destinations = form.destinations.map((d) => d.trim().toUpperCase()).filter(Boolean)
    if (!form.origin.trim()) return toast.error('Origin is required')
    if (destinations.length === 0) return toast.error('At least one destination required')
    if (!form.maxPrice || isNaN(form.maxPrice)) return toast.error('Enter a valid max price')

    setLoading(true)
    try {
      const payload = {
        origin: form.origin.trim().toUpperCase(),
        destinations,
        depart_date_start: form.departDateStart || undefined,
        depart_date_end: form.departDateEnd || undefined,
        max_price: parseFloat(form.maxPrice),
        max_stops: parseInt(form.maxStops),
      }
      if (editAlert) {
        await api.put(`/alerts/${editAlert._id || editAlert.id}`, payload)
        toast.success('Alert updated!')
      } else {
        await api.post('/alerts', payload)
        toast.success('Alert created!')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save alert')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0d1526] border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">
              {editAlert ? 'Edit Alert' : 'Create Price Alert'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Origin */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5">
              Origin Airport
            </label>
            <input
              value={form.origin}
              onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
              placeholder="e.g. CLE"
              maxLength={3}
              className="input-dark uppercase"
              required
            />
          </div>

          {/* Destinations */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5">
              Destinations
            </label>
            <div className="space-y-2">
              {form.destinations.map((dest, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={dest}
                    onChange={(e) => setDest(idx, e.target.value)}
                    placeholder={`e.g. JFK`}
                    maxLength={3}
                    className="input-dark uppercase flex-1"
                  />
                  {form.destinations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDest(idx)}
                      className="w-10 h-10 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 flex items-center justify-center flex-shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addDest}
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add destination
              </button>
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5">
                Depart From
              </label>
              <input
                type="date"
                value={form.departDateStart}
                onChange={(e) => setForm((f) => ({ ...f, departDateStart: e.target.value }))}
                className="input-dark"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5">
                Depart To
              </label>
              <input
                type="date"
                value={form.departDateEnd}
                onChange={(e) => setForm((f) => ({ ...f, departDateEnd: e.target.value }))}
                className="input-dark"
                min={form.departDateStart || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Max price */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5">
              Max Price ($)
            </label>
            <input
              type="number"
              value={form.maxPrice}
              onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))}
              placeholder="e.g. 500"
              min="0"
              className="input-dark"
              required
            />
          </div>

          {/* Max stops */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Max Stops
            </label>
            <div className="flex gap-2">
              {[
                { val: 0, label: 'Nonstop' },
                { val: 1, label: '1 Stop' },
                { val: 2, label: 'Any' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, maxStops: val }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    form.maxStops === val
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-[#111827] border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : editAlert ? (
                'Update Alert'
              ) : (
                'Create Alert'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
