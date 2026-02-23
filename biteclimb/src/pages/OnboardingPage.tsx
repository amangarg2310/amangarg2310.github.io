import { useState } from 'react'
import { ChevronRightIcon, SparklesIcon } from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { TIER_OPTIONS } from '../data/types'

interface OnboardingPageProps {
  onComplete: () => void
}

const CUISINE_OPTIONS = [
  { label: 'Italian', emoji: '🍝' },
  { label: 'Japanese', emoji: '🍣' },
  { label: 'Korean', emoji: '🍗' },
  { label: 'Mexican', emoji: '🌮' },
  { label: 'Chinese', emoji: '🥡' },
  { label: 'Thai', emoji: '🍜' },
  { label: 'Indian', emoji: '🍛' },
  { label: 'American', emoji: '🍔' },
  { label: 'Mediterranean', emoji: '🥙' },
  { label: 'Vietnamese', emoji: '🍲' },
]

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [step, setStep] = useState(0)
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([])
  const [slideDirection, setSlideDirection] = useState<'right' | 'left'>('right')

  const toggleCuisine = (cuisine: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    )
  }

  const goForward = (nextStep: number) => {
    setSlideDirection('right')
    setStep(nextStep)
  }

  const goBack = (prevStep: number) => {
    setSlideDirection('left')
    setStep(prevStep)
  }

  const animClass = slideDirection === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left'

  return (
    <div className="max-w-md mx-auto bg-neutral-50 min-h-screen overflow-hidden">
      {step === 0 && (
        <div key="welcome" className="flex flex-col items-center justify-center min-h-screen px-8 text-center animate-fade-in">
          <div className="mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg animate-bounce-in">
              <span className="text-3xl">🍽️</span>
            </div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-2 animate-fade-in-up stagger-1">biteclimb</h1>
            <p className="text-neutral-500 animate-fade-in-up stagger-2">Rank your way through the best food in your city</p>
          </div>

          <div className="space-y-3 mb-12 w-full max-w-xs">
            {[
              { icon: <SparklesIcon size={20} className="text-purple-600" />, bg: 'bg-purple-100', title: 'Discover S-tier dishes', sub: 'Find the best food near you' },
              { icon: <span className="text-lg">🔥</span>, bg: 'bg-pink-100', title: 'Build tier lists', sub: "Rate and rank dishes you've tried" },
              { icon: <span className="text-lg">🏆</span>, bg: 'bg-blue-100', title: 'Climb the ranks', sub: 'Earn badges and share your taste' },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm text-left animate-fade-in-up stagger-${i + 3}`}>
                <div className={`w-10 h-10 ${item.bg} rounded-lg flex items-center justify-center shrink-0`}>
                  {item.icon}
                </div>
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-neutral-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => goForward(1)}
            className="w-full max-w-xs bg-purple-600 text-white font-medium py-3.5 rounded-xl hover:bg-purple-700 active:scale-[0.97] transition-all flex items-center justify-center gap-1 animate-fade-in-up stagger-6"
          >
            Get Started <ChevronRightIcon size={18} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div key="cuisines" className={`flex flex-col min-h-screen px-6 pt-16 pb-24 ${animClass}`}>
          <div className="mb-6">
            <p className="text-sm text-purple-600 font-medium mb-1">Step 1 of 2</p>
            <h2 className="text-2xl font-bold text-neutral-900 mb-1">What do you love to eat?</h2>
            <p className="text-neutral-500 text-sm">Pick at least 3 cuisines you enjoy</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-auto">
            {CUISINE_OPTIONS.map(({ label, emoji }, i) => (
              <button
                key={label}
                onClick={() => toggleCuisine(label)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-200 text-left active:scale-[0.97] animate-fade-in-up stagger-${Math.min(i + 1, 8)} ${
                  selectedCuisines.includes(label)
                    ? 'border-purple-500 bg-purple-50 shadow-sm'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="font-medium text-sm flex-1">{label}</span>
                {selectedCuisines.includes(label) && (
                  <span className="text-purple-600 font-bold animate-bounce-in">✓</span>
                )}
              </button>
            ))}
          </div>

          <div className="fixed bottom-6 left-6 right-6 max-w-[calc(28rem-3rem)] mx-auto">
            <button
              onClick={() => goForward(2)}
              disabled={selectedCuisines.length < 3}
              className={`w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-1 shadow-lg ${
                selectedCuisines.length >= 3
                  ? 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.97]'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed shadow-none'
              }`}
            >
              Continue ({selectedCuisines.length}/3 min) <ChevronRightIcon size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div key="tutorial" className={`flex flex-col min-h-screen px-6 pt-16 pb-24 ${animClass}`}>
          <div className="mb-6">
            <p className="text-sm text-purple-600 font-medium mb-1">Step 2 of 2</p>
            <h2 className="text-2xl font-bold text-neutral-900 mb-1">How tiers work</h2>
            <p className="text-neutral-500 text-sm">Rate dishes from S (best) to F (worst)</p>
          </div>

          <div className="space-y-2.5 mb-auto">
            {TIER_OPTIONS.map((tier, i) => (
              <div
                key={tier}
                className={`flex items-center bg-white rounded-xl p-3.5 shadow-sm animate-fade-in-up stagger-${i + 1}`}
              >
                <TierBadge tier={tier} size="md" showEmoji={true} />
              </div>
            ))}
          </div>

          <div className="fixed bottom-6 left-6 right-6 max-w-[calc(28rem-3rem)] mx-auto space-y-2">
            <button
              onClick={onComplete}
              className="w-full bg-purple-600 text-white font-medium py-3.5 rounded-xl hover:bg-purple-700 active:scale-[0.97] transition-all flex items-center justify-center gap-1 shadow-lg"
            >
              Start Exploring <SparklesIcon size={18} />
            </button>
            <button
              onClick={() => goBack(1)}
              className="w-full text-sm text-neutral-500 py-2 hover:text-neutral-700 transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      )}

      {/* Step dots */}
      {step > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step ? 'bg-purple-600 w-6' : 'bg-neutral-300 w-1.5'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
