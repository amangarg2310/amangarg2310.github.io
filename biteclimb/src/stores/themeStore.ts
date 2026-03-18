import { create } from 'zustand';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  initTheme: () => Promise<void>;
}

function getSystemDark(): boolean {
  return Appearance.getColorScheme() === 'dark';
}

function resolveIsDark(theme: Theme): boolean {
  if (theme === 'system') return getSystemDark();
  return theme === 'dark';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  isDark: getSystemDark(),

  initTheme: async () => {
    try {
      const stored = await AsyncStorage.getItem('biteclimb_theme');
      if (stored && (stored === 'light' || stored === 'dark' || stored === 'system')) {
        const isDark = resolveIsDark(stored as Theme);
        set({ theme: stored as Theme, isDark });
      }
    } catch {}
  },

  setTheme: (theme) => {
    AsyncStorage.setItem('biteclimb_theme', theme);
    const isDark = resolveIsDark(theme);
    set({ theme, isDark });
  },
}));

Appearance.addChangeListener(({ colorScheme }: { colorScheme: ColorSchemeName }) => {
  const state = useThemeStore.getState();
  if (state.theme === 'system') {
    useThemeStore.setState({ isDark: colorScheme === 'dark' });
  }
});
