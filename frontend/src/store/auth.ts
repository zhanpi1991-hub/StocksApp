import { create } from 'zustand'
import type { User } from '@/types/api'

const KEY = 'stocksapp.auth'

interface AuthState {
  token: string | null
  user: User | null
  setSession: (token: string, user: User) => void
  setUser: (user: User) => void
  logout: () => void
}

function load(): { token: string | null; user: User | null } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* storage unavailable */
  }
  return { token: null, user: null }
}

function save(token: string | null, user: User | null) {
  try {
    if (token) localStorage.setItem(KEY, JSON.stringify({ token, user }))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  ...load(),
  setSession: (token, user) => {
    save(token, user)
    set({ token, user })
  },
  setUser: (user) => {
    save(get().token, user)
    set({ user })
  },
  logout: () => {
    save(null, null)
    set({ token: null, user: null })
  },
}))
