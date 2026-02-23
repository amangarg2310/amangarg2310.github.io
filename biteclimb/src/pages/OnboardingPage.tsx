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

  const toggleCuisine = (cuisine: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    )
  }

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="flex flex-col items-center justify-center min-h-screen px-8 text-center">
      <div className="mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-3xl">🍽️</span>
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">biteclimb</h1>
        <p className="text-neutral-500">Rank your way through the best food in your city</p>
      </div>

      <div className="space-y-4 mb-12 w-full max-w-xs">
        <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm text-left">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
            <SparklesIcon size={20} className="text-purple-600" />
          </div>
          <div>
            <p className="font-medium text-sm">Discover S-tier dishes</p>
            <p className="text-xs text-neutral-500">Find the best food near you</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm text-left">
          <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-lg">🔥</span>
          </div>
          <div>
            <p className="font-medium text-sm">Build tier lists</p>
            <p className="text-xs text-neutral-500">Rate and rank dishes you've tried</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm text-left">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-lg">🏆</span>
          </div>
          <div>
            <p className="font-medium text-sm">Climb the ranks</p>
            <p className="text-xs text-neutral-500">Earn badges and share your taste</p>
          </div>
        </div>
      </div>

      <button
        onClick={() => setStep(1)}
        className="w-full max-w-xs bg-purple-600 text-white font-medium py-3.5 rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1"
      >
        Get Started <ChevronRightIcon size={18} />
      </button>
    </div>,

    // Step 1: Pick cuisines
    <div key="cuisines" className="flex flex-col min-h-screen px-6 pt-16 pb-8">
      <div className="mb-8">
        <p className="text-sm text-purple-600 font-medium mb-1">Step 1 of 2</p>
        <h2 className="text-2xl font-bold text-neutral-900 mb-1">What do you love to eat?</h2>
        <p className="text-neutral-500 text-sm">Pick at least 3 cuisines you enjoy</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-auto">
        {CUISINE_OPTIONS.map(({ label, emoji }) => (
          <button
            key={label}
            onClick={() => toggleCuisine(label)}
            className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left ${
              selectedCuisines.includes(label)
                ? 'border-purple-500 bg-purple-50'
                : 'border-neutral-200 bg-white hover:border-neutral-300'
            }`}
          >
            <span className="text-2xl">{emoji}</span>
            <span className="font-medium text-sm">{label}</span>
            {selectedCuisines.includes(label) && (
              <span className="ml-auto text-purple-600 text-xs font-bold">✓</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <button
          onClick={() => setStep(2)}
          disabled={selectedCuisines.length < 3}
          className={`w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-1 ${
            selectedCuisines.length >= 3
              ? 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]'
              : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
          }`}
        >
          Continue ({selectedCuisines.length}/3 min) <ChevronRightIcon size={18} />
        </button>
      </div>
    </div>,

    // Step 2: Tier tutorial
    <div key="tutorial" className="flex flex-col min-h-screen px-6 pt-16 pb-8">
      <div className="mb-8">
        <p className="text-sm text-purple-600 font-medium mb-1">Step 2 of 2</p>
        <h2 className="text-2xl font-bold text-neutral-900 mb-1">How tiers work</h2>
        <p className="text-neutral-500 text-sm">Rate dishes from S (best) to F (worst)</p>
      </div>

      <div className="space-y-3 mb-auto">
        {TIER_OPTIONS.map((tier) => (
          <div
            key={tier}
            className="flex items-center bg-white rounded-xl p-3 shadow-sm"
          >
            <TierBadge tier={tier} size="md" showEmoji={true} />
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <button
          onClick={onComplete}
          className="w-full bg-purple-600 text-white font-medium py-3.5 rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1"
        >
          Start Exploring <SparklesIcon size={18} />
        </button>
        <button
          onClick={() => setStep(1)}
          className="w-full text-sm text-neutral-500 py-2"
        >
          Go back
        </button>
      </div>
    </div>,
  ]

  return (
    <div className="max-w-md mx-auto bg-neutral-50 min-h-screen">
      {steps[step]}

      {/* Step dots */}
      {step > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-all ${
                s === step ? 'bg-purple-600 w-4' : 'bg-neutral-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
