import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  TrophyIcon, ChevronLeftIcon, StarIcon, TrendingUpIcon,
  ZapIcon, ShieldIcon, FlameIcon, ChevronRightIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import type { TierType } from '../data/types'
import type { CuisineRankedRestaurant, ChallengerData } from '../api/client'

const CUISINES = ['All', 'Italian', 'Japanese', 'Korean', 'Mexican', 'Thai', 'Indian']

export function CuisineRankingsPage() {
  const [selectedCuisine, setSelectedCuisine] = useState('All')

  const { data: rankings = {}, isLoading } = useQuery({
    queryKey: ['cuisine-rankings', selectedCuisine],
    queryFn: () => api.restaurants.topByCuisine(selectedCuisine !== 'All' ? selectedCuisine : undefined),
  })

  const { data: challengers = [] } = useQuery({
    queryKey: ['challengers'],
    queryFn: () => api.restaurants.challengers(),
  })

  const cuisineEntries = Object.entries(rankings)
  const filteredChallengers = selectedCuisine === 'All'
    ? challengers
    : challengers.filter(c => c.cuisine === selectedCuisine)

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      {/* Header */}
      <header className="mb-5 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-1">
          <Link to="/" className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-90 transition-transform">
            <ChevronLeftIcon size={24} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <TrophyIcon size={20} className="text-yellow-500" />
              Best by Cuisine
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-xs">Ranked by community ratings</p>
          </div>
        </div>
      </header>

      {/* Cuisine filter */}
      <div className="mb-5 -mx-4 px-4 overflow-x-auto scrollbar-hide animate-fade-in-up stagger-1">
        <div className="flex space-x-2 pb-1">
          {CUISINES.map((cuisine) => (
            <button
              key={cuisine}
              onClick={() => setSelectedCuisine(cuisine)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCuisine === cuisine
                  ? 'bg-yellow-500 text-white'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {cuisine}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton h-48 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Challengers Alert */}
          {filteredChallengers.length > 0 && (
            <section className="animate-fade-in-up">
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mb-3">
                <ZapIcon size={18} className="text-orange-500" />
                Rising Challengers
              </h2>
              <div className="space-y-3">
                {filteredChallengers.map((challenger, i) => (
                  <ChallengerCard key={i} data={challenger} />
                ))}
              </div>
            </section>
          )}

          {/* Rankings by cuisine */}
          {cuisineEntries.map(([cuisine, restaurants]) => (
            <section key={cuisine} className="animate-fade-in-up">
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2 mb-3">
                <StarIcon size={16} className="text-yellow-500" />
                Best {cuisine}
                <span className="text-xs font-normal text-neutral-400 ml-1">
                  {restaurants.length} restaurants
                </span>
              </h2>
              <div className="space-y-3">
                {restaurants.map((restaurant) => (
                  <RankedRestaurantCard key={restaurant.id} restaurant={restaurant} />
                ))}
              </div>
            </section>
          ))}

          {cuisineEntries.length === 0 && (
            <div className="text-center py-12 text-neutral-500">
              <TrophyIcon size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-medium">No rankings yet</p>
              <p className="text-sm mt-1">Rate some dishes to see cuisine rankings</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RankedRestaurantCard({ restaurant }: { restaurant: CuisineRankedRestaurant }) {
  const rankColors: Record<number, string> = {
    1: 'from-yellow-400 to-yellow-600',
    2: 'from-neutral-300 to-neutral-500',
    3: 'from-orange-400 to-orange-600',
  }

  return (
    <Link
      to={`/restaurant/${restaurant.id}`}
      className="block bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-stretch">
        {/* Rank badge */}
        <div className={`w-10 flex items-center justify-center bg-gradient-to-b ${rankColors[restaurant.rank] || 'from-neutral-200 to-neutral-400'} shrink-0`}>
          <span className="text-white font-bold text-sm">#{restaurant.rank}</span>
        </div>

        {/* Image */}
        <div className="w-20 h-20 shrink-0">
          <img src={restaurant.image_url} alt={restaurant.name} className="w-full h-full object-cover" loading="lazy" />
        </div>

        {/* Info */}
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{restaurant.name}</h3>
            <TierBadge tier={restaurant.community_tier as TierType} size="sm" showEmoji={false} />
            {restaurant.is_newcomer && (
              <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <ZapIcon size={8} /> NEW
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mb-1.5">{restaurant.neighborhood}</p>

          {/* Confidence + stats */}
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-neutral-400 flex items-center gap-0.5">
              <ShieldIcon size={10} />
              {Math.round(restaurant.confidence * 100)}% confidence
            </span>
            <span className="text-neutral-400">{restaurant.rating_count} ratings</span>
            {restaurant.momentum > 0 && (
              <span className="text-green-600 flex items-center gap-0.5">
                <TrendingUpIcon size={10} /> Hot
              </span>
            )}
          </div>

          {/* Top dishes */}
          {restaurant.top_dishes.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
              {restaurant.top_dishes.map(dish => (
                <div key={dish.id} className="shrink-0 flex items-center gap-1 bg-neutral-50 dark:bg-neutral-700 rounded-full px-2 py-0.5">
                  <TierBadge tier={dish.tier as TierType} size="sm" showEmoji={false} />
                  <span className="text-[10px] text-neutral-700 dark:text-neutral-300 line-clamp-1 max-w-[80px]">{dish.name}</span>
                  {dish.labels.length > 0 && (
                    <span className="text-[8px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1 rounded">
                      {dish.labels[0].label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center pr-2">
          <ChevronRightIcon size={16} className="text-neutral-300" />
        </div>
      </div>
    </Link>
  )
}

function ChallengerCard({ data }: { data: ChallengerData }) {
  return (
    <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-xl border border-orange-200 dark:border-orange-800 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <FlameIcon size={14} className="text-orange-500" />
        <span className="text-xs font-bold text-orange-700 dark:text-orange-400">
          {data.cuisine} Challenger
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Newcomer */}
        <Link to={`/restaurant/${data.newcomer.id}`} className="flex-1 bg-white dark:bg-neutral-800 rounded-lg p-2 hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="bg-orange-500 text-white text-[8px] font-bold px-1 py-0.5 rounded">NEW</span>
            <TierBadge tier={data.newcomer.community_tier as TierType} size="sm" showEmoji={false} />
          </div>
          <p className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 line-clamp-1">{data.newcomer.name}</p>
          <p className="text-[10px] text-neutral-500">{data.newcomer.rating_count} ratings</p>
          {data.newcomer.best_dish && (
            <p className="text-[10px] text-purple-600 mt-0.5 line-clamp-1">
              {data.newcomer.best_dish.name}
            </p>
          )}
        </Link>

        {/* VS */}
        <div className="text-xs font-bold text-neutral-400 shrink-0">vs</div>

        {/* Incumbent */}
        <Link to={`/restaurant/${data.incumbent.id}`} className="flex-1 bg-white dark:bg-neutral-800 rounded-lg p-2 hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="bg-blue-500 text-white text-[8px] font-bold px-1 py-0.5 rounded">KING</span>
            <TierBadge tier={data.incumbent.community_tier as TierType} size="sm" showEmoji={false} />
          </div>
          <p className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 line-clamp-1">{data.incumbent.name}</p>
          <p className="text-[10px] text-neutral-500">{data.incumbent.rating_count} ratings</p>
          {data.incumbent.best_dish && (
            <p className="text-[10px] text-purple-600 mt-0.5 line-clamp-1">
              {data.incumbent.best_dish.name}
            </p>
          )}
        </Link>
      </div>

      <p className="text-[10px] text-orange-600 dark:text-orange-400 mt-2 font-medium">
        {data.reason}
      </p>
    </div>
  )
}
