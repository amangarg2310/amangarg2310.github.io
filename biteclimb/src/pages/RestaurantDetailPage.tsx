import { useState } from 'react'
import { Link, useParams, Navigate, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeftIcon, MapPinIcon, UsersIcon, StarIcon,
  ChevronRightIcon, TrendingUpIcon, SwordsIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import { TIER_CONFIG, TIER_OPTIONS } from '../data/types'
import { LABEL_COLORS } from '../components/DishCard'
import type { TierType } from '../data/types'

// Label emoji shortcuts
const LABEL_ICONS: Record<string, string> = {
  'Known For': '⭐',
  'Must Try': '🔥',
  'Best Tasting': '🤤',
  'Most Popular': '📈',
  'Spiciest': '🌶️',
  'Best Value': '💰',
  'Best Looking': '📸',
  'Most Unique': '✨',
  'Biggest Portion': '🍽️',
}

export function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [imageLoaded, setImageLoaded] = useState(false)
  const [sortMode, setSortMode] = useState<'rating' | 'elo'>('rating')

  const { data: restaurant, isLoading } = useQuery({
    queryKey: ['restaurant', id],
    queryFn: () => api.restaurants.get(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="pb-20 page-enter">
        <div className="h-56 w-full skeleton" />
        <div className="max-w-md mx-auto px-4 space-y-4 mt-4">
          <div className="skeleton h-8 w-2/3 rounded-lg" />
          <div className="skeleton h-4 w-1/2 rounded-lg" />
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!restaurant) return <Navigate to="/" replace />

  const overallRatingCount = restaurant.dishes.reduce(
    (sum: number, d: any) => sum + (d.rating_count || 0), 0
  )

  // Sort dishes
  const sortedDishes = [...restaurant.dishes].sort((a: any, b: any) => {
    if (sortMode === 'elo') {
      const aElo = a.elo_score ?? 1500
      const bElo = b.elo_score ?? 1500
      return bElo - aElo
    }
    return (b.bayesian_score ?? 0) - (a.bayesian_score ?? 0)
  })

  return (
    <div className="pb-20 page-enter">
      {/* Hero image */}
      <div className="relative h-56 w-full overflow-hidden">
        {!imageLoaded && <div className="absolute inset-0 skeleton" />}
        <img
          src={restaurant.image_url}
          alt={restaurant.name}
          className={`h-full w-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 bg-black/30 backdrop-blur-sm rounded-full p-2 text-white active:scale-90 transition-transform"
        >
          <ChevronLeftIcon size={24} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-white font-bold text-2xl leading-tight">{restaurant.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/80 text-sm flex items-center gap-1">
                  <MapPinIcon size={12} />{restaurant.neighborhood}
                </span>
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                  {restaurant.cuisine}
                </span>
              </div>
            </div>
            <TierBadge tier={restaurant.community_tier as TierType} size="lg" />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-white/60 text-xs flex items-center gap-1">
              <UsersIcon size={11} /> {overallRatingCount} community ratings
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4">
        {/* What to Order header */}
        <div className="flex items-center justify-between mt-5 mb-3">
          <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <StarIcon size={18} className="text-yellow-500" />
            What to Order
          </h2>

          {/* Sort toggle — only show if ELO data exists */}
          {restaurant.dishes.some((d: any) => d.matches_played > 0) && (
            <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg">
              <button
                onClick={() => setSortMode('rating')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortMode === 'rating'
                    ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500'
                }`}
              >
                By Rating
              </button>
              <button
                onClick={() => setSortMode('elo')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  sortMode === 'elo'
                    ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500'
                }`}
              >
                <SwordsIcon size={10} /> H2H
              </button>
            </div>
          )}
        </div>

        {/* Dish ranking list */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden mb-5">
          {sortedDishes.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">
              <p className="text-sm">No dishes tracked yet for this restaurant.</p>
              <p className="text-xs mt-1">Be the first to add one!</p>
            </div>
          ) : (
            sortedDishes.map((dish: any, i: number) => {
              const worthItPct = dish.worth_it_pct ?? 0
              const topLabels = (dish.labels || []).slice(0, 2)

              return (
                <Link
                  key={dish.id}
                  to={`/dish/${dish.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors border-b border-neutral-50 dark:border-neutral-700/50 last:border-0 active:scale-[0.99]"
                >
                  {/* Rank number */}
                  <span className={`w-7 text-center font-bold text-sm shrink-0 ${
                    i === 0 ? 'text-yellow-500' :
                    i === 1 ? 'text-neutral-400' :
                    i === 2 ? 'text-orange-500' :
                    'text-neutral-300'
                  }`}>
                    #{i + 1}
                  </span>

                  {/* Dish image */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
                    <img
                      src={dish.image_url}
                      alt={dish.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">
                        {dish.name}
                      </h3>
                    </div>

                    {/* Labels */}
                    {topLabels.length > 0 && (
                      <div className="flex gap-1 mb-1">
                        {topLabels.map((l: any) => (
                          <span
                            key={l.label}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${LABEL_COLORS[l.label] || 'bg-neutral-100 text-neutral-600'}`}
                          >
                            {LABEL_ICONS[l.label] || ''} {l.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                      {dish.price && (
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                          {dish.price}
                        </span>
                      )}
                      {worthItPct > 0 && (
                        <span className="text-green-600 font-medium">
                          {worthItPct}% worth it
                        </span>
                      )}
                      {dish.rating_count > 0 && (
                        <span>{dish.rating_count} ratings</span>
                      )}
                      {sortMode === 'elo' && dish.matches_played > 0 && (
                        <span className="text-purple-500 flex items-center gap-0.5">
                          <SwordsIcon size={8} /> {Math.round(dish.elo_score ?? 1500)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tier badge + arrow */}
                  <div className="flex items-center gap-2 shrink-0">
                    <TierBadge tier={dish.tier as TierType} size="sm" showEmoji={false} />
                    <ChevronRightIcon size={14} className="text-neutral-300" />
                  </div>
                </Link>
              )
            })
          )}
        </div>

        {/* Confidence note */}
        {sortedDishes.length > 0 && (
          <p className="text-[10px] text-neutral-400 text-center mb-5">
            Ranked by community tier ratings · Bayesian-adjusted for rating count
          </p>
        )}

        {/* Help rank CTA */}
        {restaurant.dishes.length >= 2 && (
          <Link
            to={`/matchup?cuisine=${encodeURIComponent(restaurant.cuisine)}`}
            className="block bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border border-purple-100 dark:border-purple-800 p-4 mb-5 hover:shadow-sm transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center shrink-0">
                <SwordsIcon size={20} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  Help rank {restaurant.cuisine} dishes
                </p>
                <p className="text-xs text-neutral-500">
                  Head-to-head comparisons make rankings more accurate
                </p>
              </div>
              <ChevronRightIcon size={16} className="text-neutral-400 ml-auto shrink-0" />
            </div>
          </Link>
        )}

        {/* Overall community rating breakdown */}
        {overallRatingCount > 0 && (
          <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-4 mb-5">
            <h3 className="font-semibold text-sm dark:text-neutral-100 mb-3 flex items-center gap-1.5">
              <TrendingUpIcon size={14} className="text-purple-500" />
              Restaurant Ratings
            </h3>
            <RestaurantRatingBreakdown dishes={restaurant.dishes} totalCount={overallRatingCount} />
          </div>
        )}
      </div>
    </div>
  )
}

function RestaurantRatingBreakdown({
  dishes,
  totalCount,
}: {
  dishes: any[]
  totalCount: number
}) {
  const totals: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const dish of dishes) {
    // dish.rating_count is total, but we don't have per-tier breakdown here
    // Use tier as proxy: count the dish's tier once per rating
    if (dish.rating_count > 0) {
      totals[dish.tier as string] = (totals[dish.tier as string] || 0) + dish.rating_count
    }
  }

  return (
    <div className="space-y-1.5">
      {TIER_OPTIONS.map(tier => {
        const count = totals[tier] || 0
        const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
        return (
          <div key={tier} className="flex items-center gap-2">
            <TierBadge tier={tier} size="sm" showEmoji={false} />
            <div className="flex-1">
              <div className="h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${TIER_CONFIG[tier].gradient}`}
                  style={{ width: `${pct}%`, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }}
                />
              </div>
            </div>
            <span className="text-xs text-neutral-500 w-8 text-right">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}
