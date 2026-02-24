import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  TrophyIcon, ChevronLeftIcon, StarIcon, TrendingUpIcon,
  ZapIcon, ChevronRightIcon, UtensilsIcon, StoreIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import type { TierType } from '../data/types'
import type { CuisineRankedRestaurant, DishRankingData } from '../api/client'
import { LABEL_COLORS } from '../components/DishCard'

const CUISINES = ['All', 'Italian', 'Japanese', 'Korean', 'Mexican', 'Thai', 'Indian']

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

export function CuisineRankingsPage() {
  const [selectedCuisine, setSelectedCuisine] = useState('All')
  const [viewMode, setViewMode] = useState<'dishes' | 'restaurants'>('dishes')

  const { data: rankings = {}, isLoading: restaurantsLoading } = useQuery({
    queryKey: ['cuisine-rankings', selectedCuisine],
    queryFn: () => api.restaurants.topByCuisine(selectedCuisine !== 'All' ? selectedCuisine : undefined),
    enabled: viewMode === 'restaurants',
  })

  const { data: dishRankings = [], isLoading: dishesLoading } = useQuery({
    queryKey: ['dish-rankings', selectedCuisine],
    queryFn: () => api.dishes.topByCuisine(selectedCuisine !== 'All' ? selectedCuisine : undefined),
    enabled: viewMode === 'dishes',
  })

  const isLoading = viewMode === 'dishes' ? dishesLoading : restaurantsLoading
  const cuisineEntries = Object.entries(rankings)

  // Group dish rankings by cuisine for "All" view
  const dishesByCuisine: Record<string, DishRankingData[]> = {}
  if (viewMode === 'dishes') {
    if (selectedCuisine !== 'All') {
      dishesByCuisine[selectedCuisine] = dishRankings as DishRankingData[]
    } else {
      for (const d of dishRankings as DishRankingData[]) {
        if (!dishesByCuisine[d.cuisine]) dishesByCuisine[d.cuisine] = []
        dishesByCuisine[d.cuisine].push(d)
      }
    }
  }

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

      {/* View mode toggle */}
      <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl mb-5 animate-fade-in-up">
        <button
          onClick={() => setViewMode('dishes')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            viewMode === 'dishes'
              ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500'
          }`}
        >
          <UtensilsIcon size={14} />
          Best Dishes
        </button>
        <button
          onClick={() => setViewMode('restaurants')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            viewMode === 'restaurants'
              ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500'
          }`}
        >
          <StoreIcon size={14} />
          Best Restaurants
        </button>
      </div>

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
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : viewMode === 'dishes' ? (
        /* ── Best Dishes view ── */
        <div className="space-y-8">
          {Object.entries(dishesByCuisine).map(([cuisine, dishes]) => (
            <section key={cuisine} className="animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <StarIcon size={16} className="text-yellow-500" />
                  Best {cuisine}
                  <span className="text-xs font-normal text-neutral-400 ml-1">{dishes.length} dishes</span>
                </h2>
                <Link
                  to={`/matchup?cuisine=${encodeURIComponent(cuisine)}`}
                  className="text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-0.5 hover:underline"
                >
                  Help rank →
                </Link>
              </div>

              <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden">
                {dishes.slice(0, 10).map((dish, i) => (
                  <Link
                    key={dish.id}
                    to={`/dish/${dish.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors border-b border-neutral-50 dark:border-neutral-700/50 last:border-0 active:scale-[0.99]"
                  >
                    {/* Rank */}
                    <span className={`w-7 text-center font-bold text-sm shrink-0 ${
                      i === 0 ? 'text-yellow-500' :
                      i === 1 ? 'text-neutral-400' :
                      i === 2 ? 'text-orange-500' :
                      'text-neutral-300'
                    }`}>
                      #{i + 1}
                    </span>

                    {/* Image */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                      <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{dish.name}</h3>
                      <p className="text-[10px] text-neutral-500 line-clamp-1">{dish.restaurant_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {dish.labels.slice(0, 1).map(l => (
                          <span key={l.label} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${LABEL_COLORS[l.label] || 'bg-neutral-100 text-neutral-600'}`}>
                            {LABEL_ICONS[l.label] || ''} {l.label}
                          </span>
                        ))}
                        <span className="text-[10px] text-neutral-400">{dish.rating_count} ratings</span>
                      </div>
                    </div>

                    {/* Price + tier */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {dish.price && (
                        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{dish.price}</span>
                      )}
                      <TierBadge tier={dish.tier as TierType} size="sm" showEmoji={false} />
                    </div>

                    <ChevronRightIcon size={14} className="text-neutral-300 shrink-0" />
                  </Link>
                ))}
              </div>

              {dishes.length === 0 && (
                <div className="text-center py-8 text-neutral-500 text-sm">
                  No {cuisine} dishes rated yet
                </div>
              )}
            </section>
          ))}

          {Object.keys(dishesByCuisine).length === 0 && (
            <div className="text-center py-12 text-neutral-500">
              <TrophyIcon size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-medium">No dish rankings yet</p>
              <p className="text-sm mt-1">Rate some dishes to see cuisine rankings</p>
            </div>
          )}
        </div>
      ) : (
        /* ── Best Restaurants view ── */
        <div className="space-y-8">
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

          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-neutral-400 flex items-center gap-0.5">
              <ShieldIcon size={10} />
              {restaurant.rating_count} ratings
            </span>
            {restaurant.recent_ratings > 0 && (
              <span className="text-green-600 flex items-center gap-0.5">
                <TrendingUpIcon size={10} /> {restaurant.recent_ratings} this week
              </span>
            )}
            {restaurant.velocity > 1.2 && (
              <span className="text-orange-500 flex items-center gap-0.5">
                <ZapIcon size={8} /> Hot
              </span>
            )}
          </div>

          {restaurant.top_dishes.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
              {restaurant.top_dishes.map(dish => (
                <div key={dish.id} className="shrink-0 flex items-center gap-1 bg-neutral-50 dark:bg-neutral-700 rounded-full px-2 py-0.5">
                  <TierBadge tier={dish.tier as TierType} size="sm" showEmoji={false} />
                  <span className="text-[10px] text-neutral-700 dark:text-neutral-300 line-clamp-1 max-w-[80px]">{dish.name}</span>
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
