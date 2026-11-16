import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Activity, BarChart3, Bell, Bitcoin, CalendarDays, DollarSign, Eye, GitCompare, LayoutDashboard, LogIn, LogOut, Menu,
  Newspaper, Rocket, Server, Settings, SlidersHorizontal, Sun, Moon, Briefcase, X,
} from 'lucide-react'
import { SearchBox } from './SearchBox'
import { RouteBoundary } from './guards'
import { ApiBanner } from './ApiBanner'
import { IconButton } from '@/components/ui/primitives'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { cn } from '@/utils/format'

const NAV = [
  { group: 'Markets', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/stocks', label: 'Stocks', icon: BarChart3 },
    { to: '/crypto', label: 'Crypto', icon: Bitcoin },
    { to: '/forex', label: 'Forex', icon: DollarSign },
    { to: '/news', label: 'News', icon: Newspaper },
  ] },
  { group: 'Tools', items: [
    { to: '/screener', label: 'Screener', icon: SlidersHorizontal },
    { to: '/compare', label: 'Compare', icon: GitCompare },
    { to: '/calendar', label: 'Economic calendar', icon: CalendarDays },
    { to: '/ipos', label: 'IPO calendar', icon: Rocket },
  ] },
  { group: 'My account', items: [
    { to: '/watchlists', label: 'Watchlists', icon: Eye },
    { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
    { to: '/alerts', label: 'Alerts', icon: Bell },
  ] },
  { group: 'System', items: [
    { to: '/status', label: 'Data providers', icon: Server },
  ] },
]

function Brand() {
  return (
    <div className="flex items-center gap-2 px-4">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent"><Activity size={16} /></span>
      <span className="text-[15px] font-semibold tracking-tight">Stocks<span className="text-accent">App</span></span>
    </div>
  )
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.group}</p>
          {g.items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate}
              className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition', isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function AppShell() {
  const { user, token, logout } = useAuth()
  const { theme, setTheme, sidebarOpen, setSidebar } = useUi()
  const nav = useNavigate()
  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface py-4 lg:flex"><Brand /><Nav /></aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setSidebar(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="fade-in relative flex h-full w-64 flex-col bg-surface py-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-3"><Brand /><IconButton label="Close menu" onClick={() => setSidebar(false)}><X size={16} /></IconButton></div>
            <Nav onNavigate={() => setSidebar(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-3 backdrop-blur sm:px-5">
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setSidebar(true)}><Menu size={18} /></IconButton>
          <SearchBox />
          <div className="ml-auto flex items-center gap-1">
            <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>
            {token ? (
              <>
                <IconButton label="Account settings" onClick={() => nav('/settings')}><Settings size={16} /></IconButton>
                <span className="hidden max-w-32 truncate px-1 text-xs text-muted sm:inline">{user?.display_name || user?.email}</span>
                <IconButton label="Log out" onClick={() => { logout(); nav('/') }}><LogOut size={16} /></IconButton>
              </>
            ) : (
              <button onClick={() => nav('/login')} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-white"><LogIn size={14} /> Sign in</button>
            )}
          </div>
        </header>
        <main id="main" className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto max-w-7xl"><ApiBanner /><RouteBoundary><Outlet /></RouteBoundary></div>
        </main>
      </div>
    </div>
  )
}

