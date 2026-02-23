import { useState } from 'react'
import { SearchIcon, MapPinIcon, ChevronDownIcon } from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { restaurants } from '../data/mockData'
import { TIER_OPTIONS } from '../data/types'
import type { TierType } from '../data/types'
import type { Restaurant } from '../data/types'

export function TierListBuilderPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, _setSelectedCategory] = useState('Pizza')
  const [selectedCity, _setSelectedCity] = useState('New York, NY')
  const [showRestaurants, setShowRestaurants] = useState(false)

  const [tierList, setTierList] = useState<Record<TierType, Restaurant[]>>({
    S: [], A: [], B: [], C: [], D: [], F: [],
  })

  const unrankedRestaurants = restaurants.filter(
    (r) =>
      !Object.values(tierList).flat().some((tr) => tr.id === r.id) &&
      r.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const assignToTier = (restaurant: Restaurant, tier: TierType) => {
    // Remove from any existing tier first
    const updatedTierList = { ...tierList }
    for (const t of TIER_OPTIONS) {
      updatedTierList[t] = updatedTierList[t].filter((r) => r.id !== restaurant.id)
    }
    updatedTierList[tier] = [...updatedTierList[tier], restaurant]
    setTierList(updatedTierList)
  }

  const removeFromTier = (restaurantId: string, tier: TierType) => {
    setTierList((prev) => ({
      ...prev,
      [tier]: prev[tier].filter((r) => r.id !== restaurantId),
    }))
  }

  // Drag handlers for desktop
  const handleDragStart = (e: React.DragEvent, restaurant: Restaurant, fromTier?: TierType) => {
    e.dataTransfer.setData('restaurantId', restaurant.id)
    e.dataTransfer.setData('fromTier', fromTier || 'unranked')
  }

  const handleDrop = (e: React.DragEvent, toTier: TierType) => {
    e.preventDefault()
    const restaurantId = e.dataTransfer.getData('restaurantId')
    const fromTier = e.dataTransfer.getData('fromTier')

    if (fromTier === toTier) return

    const restaurant =
      fromTier === 'unranked'
        ? restaurants.find((r) => r.id === restaurantId)
        : tierList[fromTier as TierType]?.find((r) => r.id === restaurantId)

    if (!restaurant) return
    assignToTier(restaurant, toTier)
  }

  const [assigningRestaurant, setAssigningRestaurant] = useState<Restaurant | null>(null)

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      <div className="max-w-md mx-auto px-4 py-6 lg:max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Rate the Best {selectedCategory} in {selectedCity}
          </h1>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <button className="w-full flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-neutral-200 text-left">
                <span className="font-medium">{selectedCategory}</span>
                <ChevronDownIcon size={20} className="text-neutral-400" />
              </button>
            </div>
            <div className="relative flex-1">
              <button className="w-full flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-neutral-200 text-left">
                <span className="font-medium">{selectedCity}</span>
                <MapPinIcon size={20} className="text-neutral-400" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Tier List */}
          <div className="flex-1 space-y-3">
            {TIER_OPTIONS.map((tier) => (
              <div
                key={tier}
                className="flex"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, tier)}
              >
                <div className="w-16 shrink-0">
                  <TierBadge tier={tier} size="lg" />
                </div>
                <div className="flex-1 min-h-[80px] bg-white rounded-xl border-2 border-dashed border-neutral-200 p-2 ml-3">
                  <div className="flex flex-wrap gap-2">
                    {tierList[tier].map((restaurant) => (
                      <div
                        key={restaurant.id}
                        className="relative group"
                        draggable
                        onDragStart={(e) => handleDragStart(e, restaurant, tier)}
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-neutral-200">
                          <img
                            src={restaurant.imageUrl}
                            alt={restaurant.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <span className="text-white text-xs font-medium px-1 text-center leading-tight">
                            {restaurant.name}
                          </span>
                        </div>
                        {/* Tap to remove on mobile */}
                        <button
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 active:opacity-100"
                          onClick={() => removeFromTier(restaurant.id, tier)}
                          aria-label={`Remove ${restaurant.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {tierList[tier].length === 0 && (
                      <span className="text-xs text-neutral-400 self-center ml-2">
                        Drag or tap to add
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Restaurant panel - collapsible on mobile, sidebar on desktop */}
          <div className="lg:w-80">
            <button
              className="lg:hidden w-full bg-purple-600 text-white font-medium py-3 rounded-xl mb-4"
              onClick={() => setShowRestaurants(!showRestaurants)}
            >
              {showRestaurants ? 'Hide Restaurants' : `Show Restaurants (${unrankedRestaurants.length})`}
            </button>

            <div className={`bg-white rounded-xl shadow-sm p-4 ${showRestaurants ? 'block' : 'hidden lg:block'}`}>
              <div className="relative mb-4">
                <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search restaurants..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="space-y-3">
                {unrankedRestaurants.map((restaurant) => (
                  <div key={restaurant.id}>
                    <div
                      className="flex items-center p-2 bg-neutral-50 rounded-lg cursor-move"
                      draggable
                      onDragStart={(e) => handleDragStart(e, restaurant)}
                      onClick={() => setAssigningRestaurant(
                        assigningRestaurant?.id === restaurant.id ? null : restaurant
                      )}
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden mr-3 shrink-0 border border-neutral-200">
                        <img
                          src={restaurant.imageUrl}
                          alt={restaurant.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-neutral-900">{restaurant.name}</h3>
                        <p className="text-xs text-neutral-500">{restaurant.neighborhood}</p>
                        <div className="flex items-center mt-1">
                          <TierBadge tier={restaurant.communityTier} size="sm" showEmoji={false} />
                          <span className="text-xs text-neutral-500 ml-2">
                            {restaurant.ratingCount} ratings
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Tap-to-assign tier selector (mobile-friendly) */}
                    {assigningRestaurant?.id === restaurant.id && (
                      <div className="flex gap-1.5 mt-2 ml-2 pb-1">
                        {TIER_OPTIONS.map((tier) => (
                          <button
                            key={tier}
                            onClick={() => {
                              assignToTier(restaurant, tier)
                              setAssigningRestaurant(null)
                            }}
                            className="transition-transform hover:scale-110 active:scale-95"
                          >
                            <TierBadge tier={tier} size="sm" showEmoji={false} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {unrankedRestaurants.length === 0 && (
                  <p className="text-sm text-neutral-500 text-center py-4">
                    All restaurants have been ranked!
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
