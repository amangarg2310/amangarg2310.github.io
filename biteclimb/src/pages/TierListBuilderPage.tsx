import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SearchIcon, ChevronDownIcon, ShareIcon, DownloadIcon, XIcon, SaveIcon,
  SparklesIcon, UtensilsIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import { TIER_OPTIONS } from '../data/types'
import type { TierType } from '../data/types'
import type { DishData } from '../api/client'

type BuilderMode = 'swipe' | 'grid'

const CUISINE_FILTER_OPTIONS = ['All', 'Italian', 'Japanese', 'Korean', 'Mexican', 'Thai', 'Indian']

interface DishItem {
  id: string
  name: string
  image_url: string
  restaurant: string
  price: string
  tier: string
  cuisine: string
  rating_count: number
}

function dishToItem(d: DishData): DishItem {
  return {
    id: d.id,
    name: d.name,
    image_url: d.image_url,
    restaurant: d.restaurant,
    price: d.price,
    tier: d.tier,
    cuisine: d.cuisine,
    rating_count: d.rating_count,
  }
}

export function TierListBuilderPage() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [cuisineFilter, setCuisineFilter] = useState('All')
  const [mode, setMode] = useState<BuilderMode>('swipe')
  const [showDishes, setShowDishes] = useState(false)
  const [showShareCard, setShowShareCard] = useState(false)
  const [lastAssigned, setLastAssigned] = useState<{ id: string; tier: TierType } | null>(null)
  const [listTitle, setListTitle] = useState('')
  const [saved, setSaved] = useState(false)

  const [tierList, setTierList] = useState<Record<TierType, DishItem[]>>({
    S: [], A: [], B: [], C: [], D: [], F: [],
  })

  const { data: dishes = [], isLoading } = useQuery({
    queryKey: ['dishes', cuisineFilter],
    queryFn: () => api.dishes.list({
      cuisine: cuisineFilter !== 'All' ? cuisineFilter : undefined,
    }),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.tierLists.create>[0]) =>
      api.tierLists.create(data),
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  // Auto-generate from ratings
  const autoGenerateMutation = useMutation({
    mutationFn: () => api.tierLists.autoGenerate(cuisineFilter !== 'All' ? cuisineFilter : undefined),
    onSuccess: (ratings) => {
      const newTierList: Record<TierType, DishItem[]> = { S: [], A: [], B: [], C: [], D: [], F: [] }
      for (const r of ratings) {
        const tier = r.tier as TierType
        if (TIER_OPTIONS.includes(tier)) {
          newTierList[tier].push({
            id: r.dish_id,
            name: r.name,
            image_url: r.image_url,
            restaurant: r.restaurant_name,
            price: r.price,
            tier: r.tier,
            cuisine: '',
            rating_count: 0,
          })
        }
      }
      setTierList(newTierList)
      setSaved(false)
    },
  })

  const rankedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tier of TIER_OPTIONS) for (const d of tierList[tier]) ids.add(d.id)
    return ids
  }, [tierList])

  const totalRanked = rankedIds.size

  const unrankedDishes = dishes
    .filter(d => !rankedIds.has(d.id) && d.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .map(dishToItem)

  const assignToTier = (dish: DishItem, tier: TierType) => {
    setTierList(prev => {
      const updated = { ...prev }
      for (const t of TIER_OPTIONS) updated[t] = updated[t].filter(d => d.id !== dish.id)
      updated[tier] = [...updated[tier], dish]
      return updated
    })
    setLastAssigned({ id: dish.id, tier })
    setTimeout(() => setLastAssigned(null), 600)
  }

  const removeFromTier = (dishId: string, tier: TierType) => {
    setTierList(prev => ({ ...prev, [tier]: prev[tier].filter(d => d.id !== dishId) }))
  }

  const handleDragStart = (e: React.DragEvent, dish: DishItem, fromTier?: TierType) => {
    e.dataTransfer.setData('dishId', dish.id)
    e.dataTransfer.setData('fromTier', fromTier || 'unranked')
  }

  const handleDrop = (e: React.DragEvent, toTier: TierType) => {
    e.preventDefault()
    const dishId = e.dataTransfer.getData('dishId')
    const fromTier = e.dataTransfer.getData('fromTier')
    if (fromTier === toTier) return
    const dish = fromTier === 'unranked'
      ? unrankedDishes.find(d => d.id === dishId)
      : tierList[fromTier as TierType]?.find(d => d.id === dishId)
    if (!dish) return
    assignToTier(dish, toTier)
  }

  const [assigningDish, setAssigningDish] = useState<DishItem | null>(null)

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [swipeExiting, setSwipeExiting] = useState<'left' | 'right' | null>(null)
  const touchStartRef = useRef(0)

  const currentSwipeDish = unrankedDishes[0] || null

  const handleTouchStart = (e: React.TouchEvent) => { touchStartRef.current = e.touches[0].clientX; setSwiping(true) }
  const handleTouchMove = (e: React.TouchEvent) => { if (!swiping) return; setSwipeOffset(e.touches[0].clientX - touchStartRef.current) }
  const handleTouchEnd = () => {
    setSwiping(false)
    if (currentSwipeDish) {
      if (swipeOffset > 100) {
        setSwipeExiting('right')
        setTimeout(() => { assignToTier(currentSwipeDish, 'S'); setSwipeExiting(null); setSwipeOffset(0) }, 250)
        return
      } else if (swipeOffset < -100) {
        setSwipeExiting('left')
        setTimeout(() => { setSwipeExiting(null); setSwipeOffset(0) }, 250)
        return
      }
    }
    setSwipeOffset(0)
  }

  const nonEmptyTiers = TIER_OPTIONS.filter(t => tierList[t].length > 0)

  const getSwipeTransform = () => {
    if (swipeExiting === 'right') return 'translateX(120%) rotate(15deg)'
    if (swipeExiting === 'left') return 'translateX(-120%) rotate(-15deg)'
    return `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.04}deg)`
  }

  const handleSave = () => {
    const items: { dish_id: string; tier: string; sort_order: number }[] = []
    for (const tier of TIER_OPTIONS) {
      tierList[tier].forEach((d, i) => items.push({ dish_id: d.id, tier, sort_order: i }))
    }
    saveMutation.mutate({
      title: listTitle || `Best ${cuisineFilter !== 'All' ? cuisineFilter + ' ' : ''}Dishes`,
      category: cuisineFilter !== 'All' ? cuisineFilter : 'All',
      city: 'Tampa/St. Pete, FL',
      items,
    })
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `My Dish Tier List - biteclimb`,
        text: `Check out my dish tier list on biteclimb!`,
        url: window.location.href,
      }).catch(() => {})
    }
  }

  if (isLoading) {
    return <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 pb-20 page-enter"><div className="max-w-md mx-auto px-4 py-6 space-y-4"><div className="skeleton h-8 w-2/3 rounded-lg" /><div className="skeleton h-64 rounded-2xl" /></div></div>
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 pb-20 page-enter">
      <div className="max-w-md mx-auto px-4 py-6 lg:max-w-6xl">
        <header className="mb-5">
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-1">
            <UtensilsIcon size={20} className="inline mr-1.5 text-purple-500" />
            Tier List Builder
          </h1>
          <p className="text-sm text-neutral-500 mb-4">Rank your favorite dishes into tiers</p>

          {/* Cuisine Filter */}
          <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide mb-4">
            <div className="flex gap-2 pb-1">
              {CUISINE_FILTER_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => { setCuisineFilter(c); setSaved(false) }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    cuisineFilter === c
                      ? 'bg-purple-600 text-white'
                      : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Generate Button */}
          <button
            onClick={() => autoGenerateMutation.mutate()}
            disabled={autoGenerateMutation.isPending}
            className="w-full mb-4 py-2.5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-xl text-sm font-medium text-purple-700 dark:text-purple-300 flex items-center justify-center gap-2 hover:shadow-sm active:scale-[0.98] transition-all"
          >
            <SparklesIcon size={16} />
            {autoGenerateMutation.isPending ? 'Generating...' : 'Auto-Generate from My Ratings'}
          </button>

          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-1"><span>Progress</span><span className="font-medium">{totalRanked}/{dishes.length} ranked</span></div>
            <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${(totalRanked / Math.max(dishes.length, 1)) * 100}%` }} />
            </div>
          </div>

          <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg lg:hidden">
            <button className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${mode === 'swipe' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`} onClick={() => setMode('swipe')}>Swipe Mode</button>
            <button className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${mode === 'grid' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`} onClick={() => setMode('grid')}>Grid Mode</button>
          </div>
        </header>

        {/* Swipe Mode */}
        {mode === 'swipe' && (
          <div className="lg:hidden">
            {currentSwipeDish ? (
              <div className="mb-6">
                <div className="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-lg overflow-hidden mx-auto"
                  style={{ transform: getSwipeTransform(), transition: swiping ? 'none' : 'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s', opacity: swipeExiting ? 0.7 : 1 }}
                  onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                >
                  <div className="absolute top-4 left-4 z-10 bg-green-500 text-white font-bold px-3 py-1 rounded-lg text-sm -rotate-12 pointer-events-none" style={{ opacity: Math.max(0, Math.min(1, (swipeOffset - 30) / 70)) }}>S-TIER!</div>
                  <div className="absolute top-4 right-4 z-10 bg-neutral-500 text-white font-bold px-3 py-1 rounded-lg text-sm rotate-12 pointer-events-none" style={{ opacity: Math.max(0, Math.min(1, (-swipeOffset - 30) / 70)) }}>SKIP</div>
                  <div className="h-52 w-full"><img src={currentSwipeDish.image_url} alt={currentSwipeDish.name} className="w-full h-full object-cover" /></div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-lg dark:text-neutral-100">{currentSwipeDish.name}</h3>
                      <TierBadge tier={currentSwipeDish.tier as TierType} size="sm" showEmoji={false} />
                    </div>
                    <p className="text-sm text-neutral-500 mb-0.5">{currentSwipeDish.restaurant}</p>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      {currentSwipeDish.price && <span className="font-medium text-neutral-600 dark:text-neutral-300">{currentSwipeDish.price}</span>}
                      <span>{currentSwipeDish.rating_count} ratings</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-2">Swipe right for S-tier, left to skip, or pick below</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-neutral-500 text-center mb-2">Tap to assign a tier</p>
                  <div className="flex justify-center gap-2">
                    {TIER_OPTIONS.map(tier => (
                      <button key={tier} onClick={() => { if (currentSwipeDish) assignToTier(currentSwipeDish, tier) }} className="transition-all duration-200 hover:scale-110 active:scale-90">
                        <TierBadge tier={tier} size="md" showEmoji={false} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm mb-6 animate-scale-in">
                <div className="text-3xl mb-2">🎉</div>
                <p className="text-lg font-semibold mb-1 dark:text-neutral-100">All done!</p>
                <p className="text-sm text-neutral-500">You've ranked all {dishes.length} dishes</p>
              </div>
            )}
            {totalRanked > 0 && (
              <div className="space-y-2 animate-fade-in">
                <h3 className="font-semibold text-sm dark:text-neutral-100">Your Rankings</h3>
                {nonEmptyTiers.map(tier => (
                  <div key={tier} className="flex items-center gap-2">
                    <TierBadge tier={tier} size="sm" showEmoji={false} />
                    <div className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-hide py-1">
                      {tierList[tier].map(d => (
                        <div key={d.id} className={`relative shrink-0 group ${lastAssigned?.id === d.id ? 'animate-bounce-in' : ''}`}>
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700"><img src={d.image_url} alt={d.name} className="w-full h-full object-cover" /></div>
                          <button onClick={() => removeFromTier(d.id, tier)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"><XIcon size={10} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Grid Mode */}
        <div className={`${mode === 'grid' ? 'block' : 'hidden'} lg:block`}>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-3">
              {TIER_OPTIONS.map(tier => (
                <div key={tier} className="flex" onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, tier)}>
                  <div className="w-16 shrink-0"><TierBadge tier={tier} size="lg" /></div>
                  <div className="flex-1 min-h-[72px] bg-white dark:bg-neutral-800 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 p-2 ml-3">
                    <div className="flex flex-wrap gap-2">
                      {tierList[tier].map(dish => (
                        <div key={dish.id} className={`relative group ${lastAssigned?.id === dish.id ? 'animate-bounce-in' : ''}`} draggable onDragStart={e => handleDragStart(e, dish, tier)}>
                          <div className="w-14 h-14 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700"><img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" loading="lazy" /></div>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"><span className="text-white text-[10px] font-medium px-1 text-center leading-tight">{dish.name}</span></div>
                          <button className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity" onClick={() => removeFromTier(dish.id, tier)} aria-label={`Remove ${dish.name}`}><XIcon size={10} /></button>
                        </div>
                      ))}
                      {tierList[tier].length === 0 && <span className="text-xs text-neutral-400 self-center ml-2">Drag or tap to add</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="lg:w-80">
              <button className="lg:hidden w-full bg-purple-600 text-white font-medium py-3 rounded-xl mb-4 text-sm active:scale-[0.98] transition-transform" onClick={() => setShowDishes(!showDishes)}>{showDishes ? 'Hide Dishes' : `Show Dishes (${unrankedDishes.length})`}</button>
              <div className={`bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-4 ${showDishes ? 'block' : 'hidden lg:block'}`}>
                <div className="relative mb-4">
                  <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input type="text" placeholder="Search dishes..." className="w-full pl-9 pr-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="space-y-3">
                  {unrankedDishes.map(dish => (
                    <div key={dish.id}>
                      <div className="flex items-center p-2 bg-neutral-50 dark:bg-neutral-700 rounded-lg cursor-move active:scale-[0.98] transition-transform" draggable onDragStart={e => handleDragStart(e, dish)} onClick={() => setAssigningDish(assigningDish?.id === dish.id ? null : dish)}>
                        <div className="w-14 h-14 rounded-lg overflow-hidden mr-3 shrink-0 border border-neutral-200 dark:border-neutral-700"><img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" loading="lazy" /></div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{dish.name}</h3>
                          <p className="text-xs text-neutral-500">{dish.restaurant}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <TierBadge tier={dish.tier as TierType} size="sm" showEmoji={false} />
                            {dish.price && <span className="text-xs text-neutral-400">{dish.price}</span>}
                            <span className="text-xs text-neutral-400">{dish.rating_count} ratings</span>
                          </div>
                        </div>
                      </div>
                      {assigningDish?.id === dish.id && (
                        <div className="flex gap-1.5 mt-2 ml-2 pb-1 animate-fade-in">
                          {TIER_OPTIONS.map(tier => <button key={tier} onClick={() => { assignToTier(dish, tier); setAssigningDish(null) }} className="transition-all duration-200 hover:scale-110 active:scale-90"><TierBadge tier={tier} size="sm" showEmoji={false} /></button>)}
                        </div>
                      )}
                    </div>
                  ))}
                  {unrankedDishes.length === 0 && <p className="text-sm text-neutral-500 text-center py-4">All dishes ranked!</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save + Share */}
        {totalRanked > 0 && (
          <div className="mt-6 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`Best ${cuisineFilter !== 'All' ? cuisineFilter + ' ' : ''}Dishes`}
                value={listTitle}
                onChange={e => setListTitle(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 dark:text-neutral-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button onClick={handleSave} disabled={saved || saveMutation.isPending} className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-1.5 transition-all ${saved ? 'bg-green-500 text-white' : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.97]'} disabled:opacity-50`}>
                <SaveIcon size={16} /> {saved ? 'Saved!' : saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>

            <button onClick={() => setShowShareCard(!showShareCard)} className="w-full bg-purple-600 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-purple-700 active:scale-[0.97] transition-all">
              <ShareIcon size={16} />{showShareCard ? 'Hide' : 'Share'} Your Tier List
            </button>
            {showShareCard && (
              <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg overflow-hidden animate-scale-in">
                <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-5 text-white">
                  <h3 className="font-bold text-lg mb-1">My {cuisineFilter !== 'All' ? cuisineFilter + ' ' : ''}Dish Tier List</h3>
                  <p className="text-white/70 text-sm mb-4">biteclimb</p>
                  <div className="space-y-2">
                    {nonEmptyTiers.map(tier => (
                      <div key={tier} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center font-bold text-sm">{tier}</div>
                        <div className="flex gap-1.5">{tierList[tier].map(d => <div key={d.id} className="w-8 h-8 rounded overflow-hidden"><img src={d.image_url} alt={d.name} className="w-full h-full object-cover" /></div>)}</div>
                        <span className="text-white/60 text-xs ml-auto truncate max-w-[120px]">{tierList[tier].map(d => d.name).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 flex gap-3">
                  <button className="flex-1 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium flex items-center justify-center gap-1 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-[0.98] transition-all dark:text-neutral-100"><DownloadIcon size={14} /> Save Image</button>
                  <button onClick={handleShare} className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium flex items-center justify-center gap-1 hover:bg-purple-700 active:scale-[0.98] transition-all"><ShareIcon size={14} /> Share</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
