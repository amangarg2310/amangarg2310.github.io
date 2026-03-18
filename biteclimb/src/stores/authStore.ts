import { create } from 'zustand';
import { api, setToken, removeToken } from '../api/client';
import type { UserMeData } from '../api/client';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  user: UserMeData | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: UserMeData) => void;
  initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  initAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync('biteclimb_token');
      if (token) {
        set({ token });
        await get().fetchMe();
      } else {
        set({ isLoading: false, isAuthenticated: false });
      }
    } catch {
      set({ isLoading: false, isAuthenticated: false });
    }
  },

  login: async (email, password) => {
    const { token, user } = await api.auth.login({ email, password });
    await setToken(token);
    set({ token, isAuthenticated: true });
    await get().fetchMe();
    if (!get().user) {
      set({ user: { ...user, created_at: '', products_rated: 0, tier_lists: 0, followers: 0, following: 0, category_prefs: [], taste_dna: [], favorites: [], streak: 0, try_count: 0 } });
    }
  },

  signup: async (email, username, password) => {
    const { token, user } = await api.auth.signup({ email, username, password });
    await setToken(token);
    set({ token, isAuthenticated: true, user: { ...user, created_at: '', products_rated: 0, tier_lists: 0, followers: 0, following: 0, category_prefs: [], taste_dna: [], favorites: [], streak: 0, try_count: 0 } });
  },

  logout: async () => {
    await removeToken();
    set({ user: null, token: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    try {
      const token = await SecureStore.getItemAsync('biteclimb_token');
      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }
      const user = await api.auth.me();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await removeToken();
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user }),
}));
