import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DiscoverPage } from './pages/DiscoverPage'
import { DishDetailPage } from './pages/DishDetailPage'
import { TierListBuilderPage } from './pages/TierListBuilderPage'
import { ProfilePage } from './pages/ProfilePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { Navigation } from './components/Navigation'

export default function App() {
  const [onboarded, setOnboarded] = useState(() => {
    return localStorage.getItem('biteclimb_onboarded') === 'true'
  })

  const completeOnboarding = () => {
    localStorage.setItem('biteclimb_onboarded', 'true')
    setOnboarded(true)
  }

  if (!onboarded) {
    return <OnboardingPage onComplete={completeOnboarding} />
  }

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-neutral-50">
        <div className="flex-1 pb-16">
          <Routes>
            <Route path="/" element={<DiscoverPage />} />
            <Route path="/dish/:id" element={<DishDetailPage />} />
            <Route path="/tier-builder" element={<TierListBuilderPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </div>
        <Navigation />
      </div>
    </BrowserRouter>
  )
}
