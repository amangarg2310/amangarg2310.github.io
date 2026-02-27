import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './stores/authStore'
import { useLocationStore } from './stores/locationStore'
import { DiscoverPage } from './pages/DiscoverPage'
import { DishDetailPage } from './pages/DishDetailPage'
import { TierListBuilderPage } from './pages/TierListBuilderPage'
import { ProfilePage } from './pages/ProfilePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { AuthPage } from './pages/AuthPage'
import { ActivityFeedPage } from './pages/ActivityFeedPage'
import { MapViewPage } from './pages/MapViewPage'
import { CuisineRankingsPage } from './pages/CuisineRankingsPage'
import { RestaurantDetailPage } from './pages/RestaurantDetailPage'
import { MatchupPage } from './pages/MatchupPage'
import { AddRestaurantPage } from './pages/AddRestaurantPage'
import { Navigation } from './components/Navigation'
import { ScrollToTop } from './components/ScrollToTop'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function AppContent() {
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore()
  const requestLocation = useLocationStore((s) => s.requestLocation)
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('biteclimb_onboarded') === 'true')

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  useEffect(() => {
    if (isAuthenticated) {
      requestLocation()
    }
  }, [isAuthenticated, requestLocation])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg animate-bounce-in">
            <span className="text-2xl">🍽️</span>
          </div>
          <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthPage />
  }

  if (!onboarded) {
    return (
      <OnboardingPage
        onComplete={() => {
          localStorage.setItem('biteclimb_onboarded', 'true')
          setOnboarded(true)
        }}
      />
    )
  }

  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="flex flex-col min-h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="flex-1 pb-16">
          <Routes>
            <Route path="/" element={<DiscoverPage />} />
            <Route path="/dish/:id" element={<DishDetailPage />} />
            <Route path="/tier-builder" element={<TierListBuilderPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/feed" element={<ActivityFeedPage />} />
            <Route path="/map" element={<MapViewPage />} />
            <Route path="/rankings" element={<CuisineRankingsPage />} />
            <Route path="/restaurant/:id" element={<RestaurantDetailPage />} />
            <Route path="/matchup" element={<MatchupPage />} />
            <Route path="/add-restaurant" element={<AddRestaurantPage />} />
            <Route path="/user/:id" element={<ProfilePage />} />
          </Routes>
        </div>
        <Navigation />
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
