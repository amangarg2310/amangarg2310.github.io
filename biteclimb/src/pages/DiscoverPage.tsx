import { useState } from 'react'
import { SearchIcon, MapIcon, ListIcon } from 'lucide-react'
import { DishCard } from '../components/DishCard'
import { TierList } from '../components/TierList'
import { dishes, cuisineTypes } from '../data/mockData'

export function DiscoverPage() {
  const [view, setView] = useState<'list' | 'map'>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCuisine, setSelectedCuisine] = useState('All')

  const filteredDishes = dishes.filter((dish) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      dish.name.toLowerCase().includes(term) ||
      dish.restaurant.toLowerCase().includes(term) ||
      dish.location.toLowerCase().includes(term)
    const matchesCuisine = selectedCuisine === 'All' || dish.cuisine === selectedCuisine
    return matchesSearch && matchesCuisine
  })

  const topRated = dishes
    .filter((d) => d.tier === 'S' || d.tier === 'A')
    .slice(0, 4)

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">biteclimb</h1>
        <p className="text-neutral-600 text-sm">Climb your way through the best dishes</p>
      </header>

      {/* Search */}
      <div className="relative mb-6">
        <SearchIcon size={18} className="absolute left-3 top-3 text-neutral-400" />
        <input
          type="text"
          placeholder="Search dishes, cuisines, or locations..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Cuisine filter chips */}
      <div className="mb-6 overflow-x-auto scrollbar-hide">
        <div className="flex space-x-2 pb-2">
          {cuisineTypes.map((cuisine) => (
            <button
              key={cuisine}
              onClick={() => setSelectedCuisine(cuisine)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCuisine === cuisine
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {cuisine}
            </button>
          ))}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-center mb-6">
        <div className="flex bg-neutral-100 p-1 rounded-lg">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
              view === 'list' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'
            }`}
            onClick={() => setView('list')}
          >
            <ListIcon size={16} /> List
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
              view === 'map' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'
            }`}
            onClick={() => setView('map')}
          >
            <MapIcon size={16} /> Map
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <>
          {/* Top rated tier list (only when no search/filter active) */}
          {!searchTerm && selectedCuisine === 'All' && (
            <TierList
              title="Top Rated Near You"
              items={topRated}
              author="Community"
              showViewAll={false}
            />
          )}

          <div className="grid grid-cols-1 gap-4">
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
                <p className="font-medium">No dishes found</p>
                <p className="text-sm mt-1">Try a different search or cuisine filter</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-neutral-100 rounded-xl h-[400px] flex items-center justify-center">
          <div className="text-center text-neutral-500">
            <MapIcon size={48} className="mx-auto mb-2 opacity-50" />
            <p>Map view coming soon</p>
            <p className="text-sm mt-2">
              Showing {filteredDishes.length} dishes in NYC
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
