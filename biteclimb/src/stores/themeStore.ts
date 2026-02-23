import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  isDark: boolean
  setTheme: (theme: Theme) => void
}

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveIsDark(theme: Theme): boolean {
  if (theme === 'system') return getSystemDark()
  return theme === 'dark'
}

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

const stored = (localStorage.getItem('biteclimb_theme') as Theme) || 'system'
const initialDark = resolveIsDark(stored)
applyTheme(initialDark)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: stored,
  isDark: initialDark,
  setTheme: (theme) => {
    localStorage.setItem('biteclimb_theme', theme)
    const isDark = resolveIsDark(theme)
    applyTheme(isDark)
    set({ theme, isDark })
  },
}))

// Listen for system changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const state = useThemeStore.getState()
  if (state.theme === 'system') {
    const isDark = getSystemDark()
    applyTheme(isDark)
    useThemeStore.setState({ isDark })
  }
})
