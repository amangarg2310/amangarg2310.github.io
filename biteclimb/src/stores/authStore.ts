import { create } from 'zustand'
import { api } from '../api/client'
import type { UserMeData } from '../api/client'

interface AuthState {
  user: UserMeData | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean

  login: (email: string, password: string) => Promise<void>
  signup: (email: string, username: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  setUser: (user: UserMeData) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('biteclimb_token'),
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const { token, user } = await api.auth.login({ email, password })
    localStorage.setItem('biteclimb_token', token)
    set({ token, isAuthenticated: true })
    // Fetch full profile after login
    await get().fetchMe()
    // Use the basic user data if fetchMe didn't populate
    if (!get().user) {
      set({ user: { ...user, created_at: '', dishes_rated: 0, tier_lists: 0, followers: 0, following: 0, cuisine_prefs: [], taste_dna: [], favorites: [], streak: 0 } })
    }
  },

  signup: async (email, username, password) => {
    const { token, user } = await api.auth.signup({ email, username, password })
    localStorage.setItem('biteclimb_token', token)
    set({ token, isAuthenticated: true, user: { ...user, created_at: '', dishes_rated: 0, tier_lists: 0, followers: 0, following: 0, cuisine_prefs: [], taste_dna: [], favorites: [], streak: 0 } })
  },

  logout: () => {
    localStorage.removeItem('biteclimb_token')
    set({ user: null, token: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    const token = localStorage.getItem('biteclimb_token')
    if (!token) {
      set({ isLoading: false, isAuthenticated: false })
      return
    }
    try {
      const user = await api.auth.me()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem('biteclimb_token')
      set({ user: null, token: null, isAuthenticated: false, isLoading: false })
    }
  },

  setUser: (user) => set({ user }),
}))
