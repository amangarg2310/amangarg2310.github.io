import { useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { MapPinIcon, ChevronLeftIcon, HeartIcon, ShareIcon, MessageSquareIcon } from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { getDishById } from '../data/mockData'
import { TIER_CONFIG, TIER_OPTIONS } from '../data/types'
import type { TierType } from '../data/types'

export function DishDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [selectedTier, setSelectedTier] = useState<TierType | null>(null)

  const dish = id ? getDishById(id) : undefined

  if (!dish) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="pb-6">
      {/* Hero image */}
      <div className="relative h-72 w-full">
        <img src={dish.imageUrl} alt={dish.name} className="h-full w-full object-cover" />
        <Link
          to="/"
          className="absolute top-4 left-4 bg-black/30 backdrop-blur-sm rounded-full p-2 text-white"
          aria-label="Go back"
        >
          <ChevronLeftIcon size={24} />
        </Link>
        <div className="absolute bottom-4 right-4 flex space-x-2">
          <button
            className="bg-black/30 backdrop-blur-sm rounded-full p-2 text-white"
            aria-label="Save to favorites"
          >
            <HeartIcon size={20} />
          </button>
          <button
            className="bg-black/30 backdrop-blur-sm rounded-full p-2 text-white"
            aria-label="Share"
          >
            <ShareIcon size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4">
        {/* Title + tier */}
        <div className="flex items-start justify-between mt-4 mb-2">
          <h1 className="text-2xl font-bold text-neutral-900">{dish.name}</h1>
          <TierBadge tier={dish.tier} size="lg" />
        </div>

        {/* Restaurant + location */}
        <div className="flex items-center text-sm text-neutral-600 mb-4">
          <span className="font-medium mr-2">{dish.restaurant}</span>
          <span className="flex items-center">
            <MapPinIcon size={14} className="mr-1" />
            {dish.location}
          </span>
        </div>

        <p className="text-neutral-700 mb-4">{dish.description}</p>

        <div className="flex justify-between items-center mb-6">
          <span className="text-lg font-semibold">{dish.price}</span>
          <span className="text-neutral-500 text-sm">{dish.ratingCount} ratings</span>
        </div>

        {/* Rating distribution */}
        {dish.ratings && (
          <div className="bg-neutral-50 rounded-xl p-4 mb-6">
            <h2 className="font-semibold mb-3">Rating Distribution</h2>
            <div className="space-y-2">
              {TIER_OPTIONS.map((tier) => {
                const count = dish.ratings![tier]
                const percentage = Math.round((count / dish.ratingCount) * 100)
                const gradient = TIER_CONFIG[tier].gradient
                return (
                  <div key={tier} className="flex items-center">
                    <TierBadge tier={tier} size="sm" showEmoji={false} />
                    <div className="ml-3 flex-1">
                      <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <span className="ml-2 text-xs text-neutral-500 w-6 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Rate this dish */}
        <div className="mb-8">
          <h2 className="font-semibold mb-3">Rate this dish</h2>
          <div className="flex justify-between">
            {TIER_OPTIONS.map((tier) => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={`transition-transform ${selectedTier === tier ? 'scale-110' : ''}`}
              >
                <TierBadge tier={tier} size="sm" />
              </button>
            ))}
          </div>
          <button
            className={`w-full py-3 mt-4 rounded-xl font-medium transition-colors ${
              selectedTier
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
            disabled={!selectedTier}
          >
            Submit Rating
          </button>
        </div>

        {/* Reviews header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Reviews</h2>
          <button className="text-sm font-medium text-purple-600 flex items-center">
            <MessageSquareIcon size={16} className="mr-1" /> Add review
          </button>
        </div>
      </div>
    </div>
  )
}
