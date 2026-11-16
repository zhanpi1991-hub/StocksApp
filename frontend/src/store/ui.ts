import { create } from 'zustand'

type Theme = 'dark' | 'light'
const THEME_KEY = 'stocksapp.theme'
const RECENT_KEY = 'stocksapp.recent'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

export interface RecentSearch {
  label: string
  to: string
}

interface UiState {
  theme: Theme
  recent: RecentSearch[]
  sidebarOpen: boolean
  setTheme: (t: Theme) => void
  addRecent: (r: RecentSearch) => void
  clearRecent: () => void
  setSidebar: (v: boolean) => void
}

const initial = read<Theme>(THEME_KEY, 'dark')
document.documentElement.dataset.theme = initial

export const useUi = create<UiState>((set, get) => ({
  theme: initial,
  recent: read<RecentSearch[]>(RECENT_KEY, []),
  sidebarOpen: false,
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme
    write(THEME_KEY, theme)
    set({ theme })
  },
  addRecent: (r) => {
    const next = [r, ...get().recent.filter((x) => x.to !== r.to)].slice(0, 6)
    write(RECENT_KEY, next)
    set({ recent: next })
  },
  clearRecent: () => {
    write(RECENT_KEY, [])
    set({ recent: [] })
  },
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
}))
