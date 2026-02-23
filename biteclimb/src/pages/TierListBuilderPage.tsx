import { useState, useRef } from 'react'
import {
  SearchIcon, MapPinIcon, ChevronDownIcon, ShareIcon, DownloadIcon, XIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { restaurants } from '../data/mockData'
import { TIER_OPTIONS } from '../data/types'
import type { TierType } from '../data/types'
import type { Restaurant } from '../data/types'

type BuilderMode = 'swipe' | 'grid'

export function TierListBuilderPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, _setSelectedCategory] = useState('Pizza')
  const [selectedCity, _setSelectedCity] = useState('New York, NY')
  const [mode, setMode] = useState<BuilderMode>('swipe')
  const [showRestaurants, setShowRestaurants] = useState(false)
  const [showShareCard, setShowShareCard] = useState(false)

  const [tierList, setTierList] = useState<Record<TierType, Restaurant[]>>({
    S: [], A: [], B: [], C: [], D: [], F: [],
  })

  const totalRanked = Object.values(tierList).flat().length

  const unrankedRestaurants = restaurants.filter(
    (r) =>
      !Object.values(tierList).flat().some((tr) => tr.id === r.id) &&
      r.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const assignToTier = (restaurant: Restaurant, tier: TierType) => {
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

  // Swipe mode state
  const [swipeIndex, setSwipeIndex] = useState(0)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const touchStartRef = useRef({ x: 0, y: 0 })

  const currentSwipeRestaurant = unrankedRestaurants[swipeIndex] || null

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    setSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return
    const dx = e.touches[0].clientX - touchStartRef.current.x
    setSwipeOffset(dx)
  }

  const handleTouchEnd = () => {
    setSwiping(false)
    if (Math.abs(swipeOffset) > 100 && currentSwipeRestaurant) {
      // Swipe right = S tier, swipe left = skip (move to end)
      if (swipeOffset > 100) {
        assignToTier(currentSwipeRestaurant, 'S')
      }
      // left swipe just skips
    }
    setSwipeOffset(0)
  }

  const nonEmptyTiers = TIER_OPTIONS.filter((t) => tierList[t].length > 0)

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      <div className="max-w-md mx-auto px-4 py-6 lg:max-w-6xl">
        <header className="mb-5">
          <h1 className="text-xl font-bold text-neutral-900 mb-1">
            Rate the Best {selectedCategory} in {selectedCity}
          </h1>
          <div className="flex gap-3 mb-4">
            <button className="flex-1 flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-neutral-200 text-left text-sm">
              <span className="font-medium">{selectedCategory}</span>
              <ChevronDownIcon size={18} className="text-neutral-400" />
            </button>
            <button className="flex-1 flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-neutral-200 text-left text-sm">
              <span className="font-medium">{selectedCity}</span>
              <MapPinIcon size={18} className="text-neutral-400" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
              <span>Progress</span>
              <span>{totalRanked}/{restaurants.length} ranked</span>
            </div>
            <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${(totalRanked / restaurants.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-neutral-100 p-0.5 rounded-lg lg:hidden">
            <button
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'swipe' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'
              }`}
              onClick={() => setMode('swipe')}
            >
              Swipe Mode
            </button>
            <button
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'grid' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'
              }`}
              onClick={() => setMode('grid')}
            >
              Grid Mode
            </button>
          </div>
        </header>

        {/* Swipe Mode (mobile default) */}
        {mode === 'swipe' && (
          <div className="lg:hidden">
            {currentSwipeRestaurant ? (
              <div className="mb-6">
                {/* Swipe card */}
                <div
                  className="relative bg-white rounded-2xl shadow-lg overflow-hidden mx-auto"
                  style={{
                    transform: `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.05}deg)`,
                    transition: swiping ? 'none' : 'transform 0.3s ease',
                  }}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  {/* Swipe indicators */}
                  {swipeOffset > 50 && (
                    <div className="absolute top-4 left-4 z-10 bg-green-500 text-white font-bold px-3 py-1 rounded-lg text-sm -rotate-12">
                      S-TIER!
                    </div>
                  )}
                  {swipeOffset < -50 && (
                    <div className="absolute top-4 right-4 z-10 bg-neutral-500 text-white font-bold px-3 py-1 rounded-lg text-sm rotate-12">
                      SKIP
                    </div>
                  )}

                  <div className="h-56 w-full">
                    <img
                      src={currentSwipeRestaurant.imageUrl}
                      alt={currentSwipeRestaurant.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-lg">{currentSwipeRestaurant.name}</h3>
                      <TierBadge tier={currentSwipeRestaurant.communityTier} size="sm" showEmoji={false} />
                    </div>
                    <p className="text-sm text-neutral-500 mb-2">
                      {currentSwipeRestaurant.neighborhood} · {currentSwipeRestaurant.ratingCount} community ratings
                    </p>
                    <p className="text-xs text-neutral-400">Swipe right for S-tier, or pick a tier below</p>
                  </div>
                </div>

                {/* Tier selection buttons */}
                <div className="mt-4">
                  <p className="text-xs text-neutral-500 text-center mb-2">Tap to assign a tier</p>
                  <div className="flex justify-center gap-2">
                    {TIER_OPTIONS.map((tier) => (
                      <button
                        key={tier}
                        onClick={() => {
                          if (currentSwipeRestaurant) {
                            assignToTier(currentSwipeRestaurant, tier)
                          }
                        }}
                        className="transition-transform hover:scale-110 active:scale-95"
                      >
                        <TierBadge tier={tier} size="md" showEmoji={false} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Skip button */}
                <div className="flex justify-center gap-4 mt-4">
                  <button
                    onClick={() => setSwipeIndex((i) => i + 1)}
                    className="px-6 py-2 rounded-full border border-neutral-200 text-sm text-neutral-500 hover:bg-neutral-100"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-white rounded-2xl shadow-sm mb-6">
                <p className="text-lg font-semibold mb-1">All done!</p>
                <p className="text-sm text-neutral-500">You've gone through all restaurants</p>
              </div>
            )}

            {/* Current tier list summary (swipe mode) */}
            {totalRanked > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Your Rankings</h3>
                {nonEmptyTiers.map((tier) => (
                  <div key={tier} className="flex items-center gap-2">
                    <TierBadge tier={tier} size="sm" showEmoji={false} />
                    <div className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-hide">
                      {tierList[tier].map((r) => (
                        <div key={r.id} className="relative shrink-0 group">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-200">
                            <img src={r.imageUrl} alt={r.name} className="w-full h-full object-cover" />
                          </div>
                          <button
                            onClick={() => removeFromTier(r.id, tier)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100"
                          >
                            <XIcon size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Grid Mode (desktop default, mobile toggle) */}
        <div className={`${mode === 'grid' ? 'block' : 'hidden'} lg:block`}>
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
                  <div className="flex-1 min-h-[72px] bg-white rounded-xl border-2 border-dashed border-neutral-200 p-2 ml-3">
                    <div className="flex flex-wrap gap-2">
                      {tierList[tier].map((restaurant) => (
                        <div
                          key={restaurant.id}
                          className="relative group"
                          draggable
                          onDragStart={(e) => handleDragStart(e, restaurant, tier)}
                        >
                          <div className="w-14 h-14 rounded-lg overflow-hidden border border-neutral-200">
                            <img
                              src={restaurant.imageUrl}
                              alt={restaurant.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <span className="text-white text-[10px] font-medium px-1 text-center leading-tight">
                              {restaurant.name}
                            </span>
                          </div>
                          <button
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100"
                            onClick={() => removeFromTier(restaurant.id, tier)}
                            aria-label={`Remove ${restaurant.name}`}
                          >
                            <XIcon size={10} />
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

            {/* Restaurant panel */}
            <div className="lg:w-80">
              <button
                className="lg:hidden w-full bg-purple-600 text-white font-medium py-3 rounded-xl mb-4 text-sm"
                onClick={() => setShowRestaurants(!showRestaurants)}
              >
                {showRestaurants ? 'Hide Restaurants' : `Show Restaurants (${unrankedRestaurants.length})`}
              </button>

              <div className={`bg-white rounded-xl shadow-sm p-4 ${showRestaurants ? 'block' : 'hidden lg:block'}`}>
                <div className="relative mb-4">
                  <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search restaurants..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
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
                        <div className="w-14 h-14 rounded-lg overflow-hidden mr-3 shrink-0 border border-neutral-200">
                          <img
                            src={restaurant.imageUrl}
                            alt={restaurant.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm text-neutral-900">{restaurant.name}</h3>
                          <p className="text-xs text-neutral-500">{restaurant.neighborhood}</p>
                          <div className="flex items-center mt-1">
                            <TierBadge tier={restaurant.communityTier} size="sm" showEmoji={false} />
                            <span className="text-xs text-neutral-400 ml-2">
                              {restaurant.ratingCount}
                            </span>
                          </div>
                        </div>
                      </div>
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
                      All restaurants ranked!
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Share / Results section */}
        {totalRanked > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowShareCard(!showShareCard)}
              className="w-full bg-purple-600 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-purple-700 active:scale-[0.98] transition-all"
            >
              <ShareIcon size={16} />
              {showShareCard ? 'Hide' : 'Share'} Your Tier List
            </button>

            {showShareCard && (
              <div className="mt-4 bg-white rounded-2xl shadow-lg overflow-hidden">
                {/* Shareable card preview */}
                <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-5 text-white">
                  <h3 className="font-bold text-lg mb-1">My {selectedCategory} Tier List</h3>
                  <p className="text-white/70 text-sm mb-4">{selectedCity} · biteclimb</p>
                  <div className="space-y-2">
                    {nonEmptyTiers.map((tier) => (
                      <div key={tier} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center font-bold text-sm">
                          {tier}
                        </div>
                        <div className="flex gap-1.5">
                          {tierList[tier].map((r) => (
                            <div key={r.id} className="w-8 h-8 rounded overflow-hidden">
                              <img src={r.imageUrl} alt={r.name} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                        <span className="text-white/60 text-xs ml-auto">
                          {tierList[tier].map((r) => r.name).join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 flex gap-3">
                  <button className="flex-1 py-2 rounded-lg border border-neutral-200 text-sm font-medium flex items-center justify-center gap-1 hover:bg-neutral-50">
                    <DownloadIcon size={14} /> Save Image
                  </button>
                  <button className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium flex items-center justify-center gap-1 hover:bg-purple-700">
                    <ShareIcon size={14} /> Share
                  </button>
                </div>

                {/* Community comparison */}
                <div className="px-4 pb-4">
                  <div className="bg-neutral-50 rounded-lg p-3 text-center">
                    <p className="text-sm text-neutral-600">
                      You agreed with <span className="font-bold text-purple-600">78%</span> of the community
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">Based on {restaurants.length} ranked spots</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
