import { useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import {
  MapPinIcon, ChevronLeftIcon, HeartIcon, ShareIcon,
  MessageSquareIcon, ThumbsUpIcon, UsersIcon, ChevronRightIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { DishCard } from '../components/DishCard'
import { getDishById, getReviewsForDish, getSimilarDishes } from '../data/mockData'
import { TIER_CONFIG, TIER_OPTIONS } from '../data/types'
import type { TierType } from '../data/types'

export function DishDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [selectedTier, setSelectedTier] = useState<TierType | null>(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [liked, setLiked] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const dish = id ? getDishById(id) : undefined

  if (!dish) {
    return <Navigate to="/" replace />
  }

  const dishReviews = getReviewsForDish(dish.id)
  const similarDishes = getSimilarDishes(dish)
  const images = dish.images || [dish.imageUrl]
  const worthItPercent = dish.ratings
    ? Math.round(((dish.ratings.S + dish.ratings.A) / dish.ratingCount) * 100)
    : 0

  return (
    <div className="pb-20">
      {/* Photo gallery */}
      <div className="relative h-72 w-full">
        <img
          src={images[activeImageIndex]}
          alt={dish.name}
          className="h-full w-full object-cover transition-opacity duration-300"
        />

        {/* Image dots */}
        {images.length > 1 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveImageIndex(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === activeImageIndex ? 'bg-white w-4' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        )}

        {/* Image thumbnails */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-3 flex gap-1.5">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImageIndex(i)}
                className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${
                  i === activeImageIndex ? 'border-white' : 'border-transparent opacity-70'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <Link
          to="/"
          className="absolute top-4 left-4 bg-black/30 backdrop-blur-sm rounded-full p-2 text-white"
          aria-label="Go back"
        >
          <ChevronLeftIcon size={24} />
        </Link>
        <div className="absolute top-4 right-4 flex space-x-2">
          <button
            className={`backdrop-blur-sm rounded-full p-2 transition-colors ${
              liked ? 'bg-red-500 text-white' : 'bg-black/30 text-white'
            }`}
            onClick={() => setLiked(!liked)}
            aria-label="Save to favorites"
          >
            <HeartIcon size={20} fill={liked ? 'currentColor' : 'none'} />
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
          <div className="flex-1 min-w-0 mr-3">
            <h1 className="text-2xl font-bold text-neutral-900">{dish.name}</h1>
            <div className="flex items-center text-sm text-neutral-600 mt-1">
              <span className="font-medium mr-2">{dish.restaurant}</span>
              <span className="flex items-center">
                <MapPinIcon size={14} className="mr-0.5" />
                {dish.location}
              </span>
            </div>
          </div>
          <TierBadge tier={dish.tier} size="lg" />
        </div>

        <p className="text-neutral-600 text-sm mb-4">{dish.description}</p>

        {/* Price + social proof bar */}
        <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3 mb-5">
          <span className="text-lg font-bold">{dish.price}</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500 flex items-center gap-1">
              <UsersIcon size={14} /> {dish.ratingCount} ratings
            </span>
            {worthItPercent > 0 && (
              <span className="text-green-600 font-medium">{worthItPercent}% say worth it</span>
            )}
          </div>
        </div>

        {/* Rating distribution */}
        {dish.ratings && (
          <div className="bg-white rounded-xl border border-neutral-100 p-4 mb-5">
            <h2 className="font-semibold mb-3 text-sm">Community Ratings</h2>
            <div className="space-y-2">
              {TIER_OPTIONS.map((tier) => {
                const count = dish.ratings![tier]
                const percentage = Math.round((count / dish.ratingCount) * 100)
                const gradient = TIER_CONFIG[tier].gradient
                return (
                  <div key={tier} className="flex items-center">
                    <TierBadge tier={tier} size="sm" showEmoji={false} />
                    <div className="ml-3 flex-1">
                      <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <span className="ml-2 text-xs text-neutral-500 w-8 text-right">{percentage}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Rate this dish */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 mb-5">
          <h2 className="font-semibold mb-1 text-sm">What's your rating?</h2>
          <p className="text-xs text-neutral-500 mb-3">Tap a tier to rate this dish</p>
          <div className="flex justify-between gap-1">
            {TIER_OPTIONS.map((tier) => (
              <button
                key={tier}
                onClick={() => { setSelectedTier(tier); setSubmitted(false) }}
                className={`flex-1 py-2.5 rounded-lg transition-all flex flex-col items-center ${
                  selectedTier === tier
                    ? 'bg-white shadow-md scale-105'
                    : 'hover:bg-white/50'
                }`}
              >
                <TierBadge tier={tier} size="sm" showEmoji={false} />
                <span className="text-xs text-neutral-500 mt-1">{TIER_CONFIG[tier].label}</span>
              </button>
            ))}
          </div>
          <button
            className={`w-full py-3 mt-3 rounded-xl font-medium text-sm transition-all ${
              submitted
                ? 'bg-green-500 text-white'
                : selectedTier
                  ? 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
            disabled={!selectedTier || submitted}
            onClick={() => setSubmitted(true)}
          >
            {submitted ? 'Rating Submitted!' : 'Submit Rating'}
          </button>
        </div>

        {/* Reviews */}
        {dishReviews.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Reviews ({dishReviews.length})</h2>
              <button className="text-xs font-medium text-purple-600 flex items-center gap-0.5">
                <MessageSquareIcon size={14} /> Write a review
              </button>
            </div>
            <div className="space-y-3">
              {dishReviews.map((review) => (
                <div key={review.id} className="bg-white rounded-xl border border-neutral-100 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <img
                      src={review.userAvatar}
                      alt={review.userName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{review.userName}</span>
                        <TierBadge tier={review.tier} size="sm" showEmoji={false} />
                      </div>
                      <span className="text-xs text-neutral-400">{review.date}</span>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-700 mb-2">{review.text}</p>
                  <button className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600">
                    <ThumbsUpIcon size={12} />
                    Helpful ({review.helpful})
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar dishes */}
        {similarDishes.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">You Might Also Like</h2>
              <ChevronRightIcon size={16} className="text-neutral-400" />
            </div>
            <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 pb-1">
                {similarDishes.map((d) => (
                  <div key={d.id} className="shrink-0 w-40">
                    <DishCard
                      id={d.id}
                      name={d.name}
                      imageUrl={d.imageUrl}
                      tier={d.tier}
                      location={d.location}
                      restaurant={d.restaurant}
                      ratingCount={d.ratingCount}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
