import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SearchIcon, MapIcon, ListIcon, TrendingUpIcon, FlameIcon,
  SparklesIcon, UsersIcon,
} from 'lucide-react'
import { DishCard } from '../components/DishCard'
import { TierBadge } from '../components/TierBadge'
import { dishes, cuisineTypes, getTrendingDishes, getTopRatedDishes } from '../data/mockData'

export function DiscoverPage() {
  const [view, setView] = useState<'list' | 'map'>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCuisine, setSelectedCuisine] = useState('All')

  const isSearching = searchTerm.length > 0 || selectedCuisine !== 'All'

  const filteredDishes = dishes.filter((dish) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      dish.name.toLowerCase().includes(term) ||
      dish.restaurant.toLowerCase().includes(term) ||
      dish.location.toLowerCase().includes(term)
    const matchesCuisine = selectedCuisine === 'All' || dish.cuisine === selectedCuisine
    return matchesSearch && matchesCuisine
  })

  const trendingDishes = getTrendingDishes()
  const topRated = getTopRatedDishes()
  const featuredDish = dishes.find((d) => d.id === '3')! // KFC - hot right now

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      {/* Header */}
      <header className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-neutral-900">biteclimb</h1>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">NYC</span>
        </div>
        <p className="text-neutral-500 text-sm">Climb your way through the best dishes</p>
      </header>

      {/* Search */}
      <div className="relative mb-5">
        <SearchIcon size={18} className="absolute left-3 top-3 text-neutral-400" />
        <input
          type="text"
          placeholder="Search dishes, cuisines, or locations..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Cuisine filter chips */}
      <div className="mb-5 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex space-x-2 pb-1">
          {cuisineTypes.map((cuisine) => (
            <button
              key={cuisine}
              onClick={() => setSelectedCuisine(cuisine)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCuisine === cuisine
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              {cuisine}
            </button>
          ))}
        </div>
      </div>

      {/* If searching/filtering, show flat results */}
      {isSearching ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-neutral-500">{filteredDishes.length} results</p>
            <div className="flex bg-neutral-100 p-0.5 rounded-lg">
              <button
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  view === 'list' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'
                }`}
                onClick={() => setView('list')}
              >
                <ListIcon size={14} /> List
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  view === 'map' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'
                }`}
                onClick={() => setView('map')}
              >
                <MapIcon size={14} /> Map
              </button>
            </div>
          </div>
          {view === 'list' ? (
            <div className="grid grid-cols-1 gap-3">
              {filteredDishes.map((dish) => (
                <DishCard
                  key={dish.id}
                  id={dish.id}
                  name={dish.name}
                  imageUrl={dish.imageUrl}
                  tier={dish.tier}
                  location={dish.location}
                  restaurant={dish.restaurant}
                  ratingCount={dish.ratingCount}
                />
              ))}
              {filteredDishes.length === 0 && (
                <div className="text-center py-12 text-neutral-500">
                  <SearchIcon size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No dishes found</p>
                  <p className="text-sm mt-1">Try a different search or cuisine</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-neutral-100 rounded-xl h-[400px] flex items-center justify-center">
              <div className="text-center text-neutral-500">
                <MapIcon size={48} className="mx-auto mb-2 opacity-50" />
                <p className="font-medium">Map view coming soon</p>
                <p className="text-sm mt-2">Showing {filteredDishes.length} dishes in NYC</p>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Discovery feed with sections */
        <div className="space-y-6">
          {/* Hero Featured Dish */}
          <Link to={`/dish/${featuredDish.id}`} className="block relative rounded-2xl overflow-hidden h-48 group">
            <img
              src={featuredDish.imageUrl}
              alt={featuredDish.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <FlameIcon size={12} /> HOT
              </span>
              <span className="bg-black/40 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
                +{featuredDish.trendingDelta} this week
              </span>
            </div>
            <div className="absolute top-3 right-3">
              <TierBadge tier={featuredDish.tier} size="sm" showEmoji={false} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h2 className="text-white font-bold text-lg leading-tight">{featuredDish.name}</h2>
              <p className="text-white/80 text-sm">{featuredDish.restaurant} · {featuredDish.location}</p>
              <p className="text-white/60 text-xs mt-1 flex items-center gap-1">
                <UsersIcon size={12} />
                {featuredDish.todayRatings} people rated this today
              </p>
            </div>
          </Link>

          {/* Trending This Week */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-neutral-900 flex items-center gap-1.5">
                <TrendingUpIcon size={18} className="text-red-500" />
                Trending This Week
              </h2>
            </div>
            <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 pb-1">
                {trendingDishes.map((dish, i) => (
                  <Link
                    key={dish.id}
                    to={`/dish/${dish.id}`}
                    className="shrink-0 w-36 group"
                  >
                    <div className="relative h-36 rounded-xl overflow-hidden mb-2">
                      <img
                        src={dish.imageUrl}
                        alt={dish.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div className="absolute top-2 right-2">
                        <TierBadge tier={dish.tier} size="sm" showEmoji={false} />
                      </div>
                      <div className="absolute bottom-2 left-2">
                        <span className="bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                          <TrendingUpIcon size={10} /> +{dish.trendingDelta}
                        </span>
                      </div>
                    </div>
                    <h3 className="font-medium text-sm text-neutral-900 line-clamp-1">{dish.name}</h3>
                    <p className="text-xs text-neutral-500">{dish.restaurant}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Top Rated S-Tier */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-neutral-900 flex items-center gap-1.5">
                <SparklesIcon size={18} className="text-purple-500" />
                S-Tier Hall of Fame
              </h2>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {topRated.map((dish, i) => (
                <Link
                  key={dish.id}
                  to={`/dish/${dish.id}`}
                  className="flex items-center p-3 hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-0"
                >
                  <span className="w-6 text-center font-bold text-neutral-300 text-sm shrink-0">{i + 1}</span>
                  <div className="w-12 h-12 rounded-lg overflow-hidden mx-3 shrink-0">
                    <img src={dish.imageUrl} alt={dish.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-neutral-900 line-clamp-1">{dish.name}</h3>
                    <p className="text-xs text-neutral-500">{dish.restaurant} · {dish.location}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className="text-xs text-neutral-400">{dish.ratingCount}</span>
                    <TierBadge tier={dish.tier} size="sm" showEmoji={false} />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Explore by Cuisine */}
          <section>
            <h2 className="font-bold text-neutral-900 mb-3">Explore by Cuisine</h2>
            <div className="grid grid-cols-2 gap-3">
              {['Italian', 'Japanese', 'Korean', 'Mexican'].map((cuisine) => {
                const cuisineDishes = dishes.filter((d) => d.cuisine === cuisine)
                const topDish = cuisineDishes[0]
                if (!topDish) return null
                return (
                  <button
                    key={cuisine}
                    onClick={() => setSelectedCuisine(cuisine)}
                    className="relative h-24 rounded-xl overflow-hidden group text-left"
                  >
                    <img
                      src={topDish.imageUrl}
                      alt={cuisine}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
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
            <h2 className="font-bold text-neutral-900 mb-3">All Dishes</h2>
            <div className="grid grid-cols-2 gap-3">
              {dishes.map((dish) => (
                <DishCard
                  key={dish.id}
                  id={dish.id}
                  name={dish.name}
                  imageUrl={dish.imageUrl}
                  tier={dish.tier}
                  location={dish.location}
                  restaurant={dish.restaurant}
                  ratingCount={dish.ratingCount}
                  size="sm"
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
