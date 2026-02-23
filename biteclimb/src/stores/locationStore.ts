import { create } from 'zustand'

interface LocationState {
  lat: number | null
  lng: number | null
  city: string
  loading: boolean
  error: string | null
  requestLocation: () => void
}

export const useLocationStore = create<LocationState>((set) => ({
  lat: null,
  lng: null,
  city: 'NYC',
  loading: false,
  error: null,

  requestLocation: () => {
    if (!navigator.geolocation) {
      set({ error: 'Geolocation not supported', loading: false })
      return
    }

    set({ loading: true, error: null })

    navigator.geolocation.getCurrentPosition(
      (position) => {
        set({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          loading: false,
        })
      },
      (err) => {
        set({
          error: err.message,
          loading: false,
          // Default to NYC
          lat: 40.7128,
          lng: -74.0060,
        })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  },
}))
