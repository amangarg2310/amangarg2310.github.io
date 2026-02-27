import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  SearchIcon, MapIcon, ListIcon, TrendingUpIcon, FlameIcon,
  SparklesIcon, UsersIcon, MapPinIcon, NavigationIcon, TrophyIcon,
  ZapIcon, SwordsIcon, PlusCircleIcon,
} from 'lucide-react'
import { DishCard } from '../components/DishCard'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import { useLocationStore } from '../stores/locationStore'
import type { TierType } from '../data/types'
import type { RisingRestaurantData } from '../api/client'

const CUISINE_TYPES = ['All', 'Italian', 'Japanese', 'Korean', 'Mexican', 'Thai', 'Indian']

export function DiscoverPage() {
  const [view, setView] = useState<'list' | 'map'>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCuisine, setSelectedCuisine] = useState('All')
  const [sort, setSort] = useState<'top' | 'trending' | 'nearby'>('top')
  const { lat, lng } = useLocationStore()

  const { data: dishes = [], isLoading } = useQuery({
    queryKey: ['dishes', selectedCuisine, searchTerm, sort, lat, lng],
    queryFn: () => api.dishes.list({
      cuisine: selectedCuisine !== 'All' ? selectedCuisine : undefined,
      search: searchTerm || undefined,
      sort,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
    }),
  })

  const { data: rising = [] } = useQuery({
    queryKey: ['rising'],
    queryFn: () => api.restaurants.rising(),
  })

  const isSearching = searchTerm.length > 0 || selectedCuisine !== 'All'

  const trendingDishes = [...dishes]
    .filter(d => (d.trending_delta ?? 0) > 0)
    .sort((a, b) => (b.trending_delta ?? 0) - (a.trending_delta ?? 0))
    .slice(0, 5)

  const topRated = dishes
    .filter(d => d.tier === 'S')
    .sort((a, b) => b.rating_count - a.rating_count)
    .slice(0, 5)

  const featuredDish = dishes.find(d => d.tier === 'S' && (d.trending_delta ?? 0) > 5) || dishes[0]

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      {/* Header */}
      <header className="mb-5 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">biteclimb</h1>
          <div className="flex items-center gap-2">
            <Link to="/map" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <MapPinIcon size={10} />
              {lat ? 'Near Me' : 'Tampa'}
            </Link>
          </div>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">Climb your way through the best dishes</p>
      </header>

      {/* Search */}
      <div className="relative mb-5 animate-fade-in-up stagger-1">
        <SearchIcon size={18} className="absolute left-3 top-3 text-neutral-400" />
        <input
          type="text"
          placeholder="Search dishes, cuisines, or locations..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Cuisine filter chips */}
      <div className="mb-5 -mx-4 px-4 overflow-x-auto scrollbar-hide animate-fade-in-up stagger-2">
        <div className="flex space-x-2 pb-1">
          {CUISINE_TYPES.map((cuisine) => (
            <button
              key={cuisine}
              onClick={() => setSelectedCuisine(cuisine)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCuisine === cuisine
                  ? 'bg-purple-600 text-white'
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
      ) : isSearching ? (
        <>
          {/* Sort tabs */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {([['top', 'Top'], ['trending', 'Hot'], ['nearby', 'Near Me']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                    sort === key ? 'bg-purple-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {key === 'nearby' && <NavigationIcon size={10} />}
                  {label}
                </button>
              ))}
            </div>
            <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg">
              <button
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  view === 'list' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'
                }`}
                onClick={() => setView('list')}
              >
                <ListIcon size={14} /> List
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  view === 'map' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'
                }`}
                onClick={() => setView('map')}
              >
                <MapIcon size={14} /> Map
              </button>
            </div>
          </div>
          <p className="text-sm text-neutral-500 mb-3">{dishes.length} results</p>
          {view === 'list' ? (
            <div className="grid grid-cols-2 gap-3">
              {dishes.map((dish) => (
                <DishCard
                  key={dish.id}
                  id={dish.id}
                  name={dish.name}
                  imageUrl={dish.image_url}
                  tier={dish.tier as TierType}
                  location={dish.location}
                  restaurant={dish.restaurant}
                  ratingCount={dish.rating_count}
                  distance={dish.distance}
                  labels={dish.labels}
                  size="sm"
                />
              ))}
              {dishes.length === 0 && (
                <div className="col-span-2 text-center py-12 text-neutral-500">
                  <SearchIcon size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No dishes found</p>
                  <p className="text-sm mt-1">Try a different search or cuisine</p>
                  <Link
                    to="/add-restaurant"
                    className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-medium hover:bg-purple-700 active:scale-95 transition-all"
                  >
                    <PlusCircleIcon size={14} />
                    Add a Restaurant
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <Link to="/map" className="block bg-neutral-100 dark:bg-neutral-800 rounded-xl h-[400px] flex items-center justify-center">
              <div className="text-center text-neutral-500">
                <MapIcon size={48} className="mx-auto mb-2 opacity-50" />
                <p className="font-medium">Open Map View</p>
                <p className="text-sm mt-2">See {dishes.length} dishes on the map</p>
              </div>
            </Link>
          )}
        </>
      ) : (
        /* Discovery feed */
        <div className="space-y-6">
          {/* Hero */}
          {featuredDish && (
            <Link to={`/dish/${featuredDish.id}`} className="block relative rounded-2xl overflow-hidden h-48 group">
              <img src={featuredDish.image_url} alt={featuredDish.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <FlameIcon size={12} /> HOT
                </span>
                {featuredDish.trending_delta > 0 && (
                  <span className="bg-black/40 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
                    +{featuredDish.trending_delta} this week
                  </span>
                )}
              </div>
              <div className="absolute top-3 right-3">
                <TierBadge tier={featuredDish.tier as TierType} size="sm" showEmoji={false} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h2 className="text-white font-bold text-lg leading-tight">{featuredDish.name}</h2>
                <p className="text-white/80 text-sm">{featuredDish.restaurant} · {featuredDish.location}</p>
                <p className="text-white/60 text-xs mt-1 flex items-center gap-1">
                  <UsersIcon size={12} />
                  {featuredDish.today_ratings} people rated this today
                </p>
              </div>
            </Link>
          )}

          {/* Trending */}
          {trendingDishes.length > 0 && (
            <section>
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mb-3">
                <TrendingUpIcon size={18} className="text-red-500" />
                Trending This Week
              </h2>
              <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
                <div className="flex gap-3 pb-1">
                  {trendingDishes.map((dish, i) => (
                    <Link key={dish.id} to={`/dish/${dish.id}`} className="shrink-0 w-36 group">
                      <div className="relative h-36 rounded-xl overflow-hidden mb-2">
                        <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{i + 1}</div>
                        <div className="absolute top-2 right-2"><TierBadge tier={dish.tier as TierType} size="sm" showEmoji={false} /></div>
                        <div className="absolute bottom-2 left-2">
                          <span className="bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                            <TrendingUpIcon size={10} /> +{dish.trending_delta}
                          </span>
                        </div>
                      </div>
                      <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{dish.name}</h3>
                      <p className="text-xs text-neutral-500">{dish.restaurant}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* S-Tier */}
          {topRated.length > 0 && (
            <section>
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mb-3">
                <SparklesIcon size={18} className="text-purple-500" />
                S-Tier Hall of Fame
              </h2>
              <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden">
                {topRated.map((dish, i) => (
                  <Link key={dish.id} to={`/dish/${dish.id}`} className="flex items-center p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors border-b border-neutral-50 dark:border-neutral-700 last:border-0">
                    <span className="w-6 text-center font-bold text-neutral-300 text-sm shrink-0">{i + 1}</span>
                    <div className="w-12 h-12 rounded-lg overflow-hidden mx-3 shrink-0">
                      <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{dish.name}</h3>
                      <p className="text-xs text-neutral-500">{dish.restaurant} · {dish.location}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-xs text-neutral-400">{dish.rating_count}</span>
                      <TierBadge tier={dish.tier as TierType} size="sm" showEmoji={false} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Hot This Week */}
          {(rising as RisingRestaurantData[]).length > 0 && (
            <section>
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mb-3">
                <ZapIcon size={18} className="text-orange-500" />
                Hot This Week
              </h2>
              <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
                <div className="flex gap-3 pb-1">
                  {(rising as RisingRestaurantData[]).slice(0, 6).map((r) => (
                    <Link
                      key={r.id}
                      to={`/restaurant/${r.id}`}
                      className="shrink-0 w-40 group"
                    >
                      <div className="relative h-28 rounded-xl overflow-hidden mb-2">
                        <img
                          src={r.image_url}
                          alt={r.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute top-2 left-2">
                          <span className="bg-orange-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <ZapIcon size={8} /> {r.velocity.toFixed(1)}×
                          </span>
                        </div>
                        <div className="absolute top-2 right-2">
                          <TierBadge tier={r.community_tier as TierType} size="sm" showEmoji={false} />
                        </div>
                        <div className="absolute bottom-1.5 left-2">
                          <span className="text-white/70 text-[9px]">{r.week_ratings} this week</span>
                        </div>
                      </div>
                      <h3 className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 line-clamp-1">{r.name}</h3>
                      <p className="text-[10px] text-neutral-500">{r.cuisine}</p>
                      {r.top_dish && (
                        <p className="text-[9px] text-purple-600 dark:text-purple-400 line-clamp-1 mt-0.5">
                          ⭐ {r.top_dish.name}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Best by Cuisine CTA */}
          <section>
            <Link
              to="/rankings"
              className="block bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 p-4 hover:shadow-sm transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <TrophyIcon size={16} className="text-yellow-500" />
                    Best by Cuisine
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Best dishes &amp; restaurants ranked by cuisine</p>
                </div>
                <div className="text-yellow-500">
                  <TrophyIcon size={24} />
                </div>
              </div>
            </Link>
          </section>

          {/* Explore by Cuisine */}
          <section>
            <h2 className="font-bold text-neutral-900 dark:text-neutral-100 mb-3">Explore by Cuisine</h2>
            <div className="grid grid-cols-2 gap-3">
              {['Italian', 'Japanese', 'Korean', 'Mexican'].map((cuisine) => {
                const cuisineDishes = dishes.filter(d => d.cuisine === cuisine)
                const topDish = cuisineDishes[0]
                if (!topDish) return null
                return (
                  <button key={cuisine} onClick={() => setSelectedCuisine(cuisine)} className="relative h-24 rounded-xl overflow-hidden group text-left">
                    <img src={topDish.image_url} alt={cuisine} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />
                    <div className="absolute bottom-2 left-3">
                      <span className="text-white font-semibold text-sm">{cuisine}</span>
                      <span className="text-white/70 text-xs block">{cuisineDishes.length} dishes</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* All Dishes */}
          <section>
            <h2 className="font-bold text-neutral-900 dark:text-neutral-100 mb-3">All Dishes</h2>
            <div className="grid grid-cols-2 gap-3">
              {dishes.map((dish) => (
                <DishCard
                  key={dish.id}
                  id={dish.id}
                  name={dish.name}
                  imageUrl={dish.image_url}
                  tier={dish.tier as TierType}
                  location={dish.location}
                  restaurant={dish.restaurant}
                  ratingCount={dish.rating_count}
                  distance={dish.distance}
                  labels={dish.labels}
                  size="sm"
                />
              ))}
            </div>
          </section>

          {/* Can't find it? */}
          <section className="text-center py-4">
            <p className="text-sm text-neutral-500 mb-2">Can't find what you're looking for?</p>
            <Link
              to="/add-restaurant"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white rounded-full text-sm font-medium hover:bg-purple-700 active:scale-95 transition-all"
            >
              <PlusCircleIcon size={14} />
              Add a Restaurant
            </Link>
          </section>
        </div>
      )}
    </div>
  )
}
