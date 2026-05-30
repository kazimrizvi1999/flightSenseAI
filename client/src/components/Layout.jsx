import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Search,
  Bell,
  User,
  LogOut,
  Plane,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/profile', label: 'Profile', icon: User },
]

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
    isActive
      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
      : 'text-gray-400 hover:text-white hover:bg-[#111827]'
  }`

const mobileLinkClass = ({ isActive }) =>
  `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all text-xs font-medium ${
    isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0d1526] border-r border-gray-800/60 fixed inset-y-0 left-0 z-40">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-gray-800/60">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Plane className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">
            Flight<span className="text-blue-400">Sense</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-gray-800/60 space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#111827]">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase">
              {user?.name?.[0] || user?.email?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-gray-500 text-xs truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-900/10 transition-all text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        {/* Top bar — mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3.5 bg-[#0d1526] border-b border-gray-800/60 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">
              Flight<span className="text-blue-400">Sense</span>
            </span>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase">
            {user?.name?.[0] || user?.email?.[0] || 'U'}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#0d1526] border-t border-gray-800/60 z-40 flex items-center justify-around px-2 py-1.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={mobileLinkClass}>
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-red-400 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </nav>
    </div>
  )
}
