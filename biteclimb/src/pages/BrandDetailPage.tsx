import { useState } from 'react'
import { Link, useParams, Navigate, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeftIcon, UsersIcon, StarIcon,
  ChevronRightIcon, TrendingUpIcon, SwordsIcon,
  CheckCircle2Icon, PlusCircleIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { TIER_CONFIG, TIER_OPTIONS } from '../data/types'
import { LABEL_COLORS } from '../components/ProductCard'
import type { TierType } from '../data/types'

const LABEL_ICONS: Record<string, string> = {
  'Most Popular': '📈',
  'Must Try': '🔥',
  'Best Flavor': '🤤',
  'Best Value': '💰',
  'Most Addictive': '🔁',
  'Healthy Pick': '🥗',
  'Best Texture': '✨',
  'Underrated': '💎',
  'Best for Sharing': '🤝',
}

export function BrandDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [sortMode, setSortMode] = useState<'rating' | 'elo'>('rating')
  const [trySuccess, setTrySuccess] = useState<string | null>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('')
  const [newProductDesc, setNewProductDesc] = useState('')
  const [newProductImage, setNewProductImage] = useState('')

  const { data: brand, isLoading } = useQuery({
    queryKey: ['brand', id],
    queryFn: () => api.brands.get(id!),
    enabled: !!id,
  })

  const tryMutation = useMutation({
    mutationFn: (productId: string) => api.products.markTried(productId, {}),
    onSuccess: (_data, productId) => {
      setTrySuccess(productId)
      queryClient.invalidateQueries({ queryKey: ['brand', id] })
      setTimeout(() => setTrySuccess(null), 1500)
    },
  })

  const addProductMutation = useMutation({
    mutationFn: (data: { name: string; brand_id: string; price_range?: string; description?: string; image_url?: string }) =>
      api.products.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand', id] })
      setShowAddProduct(false)
      setNewProductName('')
      setNewProductPrice('')
      setNewProductDesc('')
      setNewProductImage('')
    },
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

  if (!brand) return <Navigate to="/" replace />

  const overallRatingCount = brand.products.reduce(
    (sum: number, d: any) => sum + (d.rating_count || 0), 0
  )

  const sortedProducts = [...brand.products].sort((a: any, b: any) => {
    if (sortMode === 'elo') {
      return (b.elo_score ?? 1500) - (a.elo_score ?? 1500)
    }
    return (b.bayesian_score ?? 0) - (a.bayesian_score ?? 0)
  })

  return (
    <div className="pb-20 page-enter">
      <div className="relative h-56 w-full overflow-hidden">
        {!imageLoaded && <div className="absolute inset-0 skeleton" />}
        <img
          src={brand.image_url}
          alt={brand.name}
          className={`h-full w-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 bg-black/30 backdrop-blur-sm rounded-full p-2 text-white active:scale-90 transition-transform">
          <ChevronLeftIcon size={24} />
        </button>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-white font-bold text-2xl leading-tight">{brand.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">{brand.category}</span>
              </div>
            </div>
            <TierBadge tier={brand.community_tier as TierType} size="lg" />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-white/60 text-xs flex items-center gap-1">
              <UsersIcon size={11} /> {overallRatingCount} community ratings
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4">
        <div className="flex items-center justify-between mt-5 mb-3">
          <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <StarIcon size={18} className="text-yellow-500" />
            Products
          </h2>
          {brand.products.some((d: any) => d.matches_played > 0) && (
            <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg">
              <button onClick={() => setSortMode('rating')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sortMode === 'rating' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`}>By Rating</button>
              <button onClick={() => setSortMode('elo')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${sortMode === 'elo' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`}><SwordsIcon size={10} /> H2H</button>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden mb-5">
          {sortedProducts.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">
              <p className="text-sm">No products tracked yet for this brand.</p>
              <p className="text-xs mt-1">Be the first to add one!</p>
            </div>
          ) : (
            sortedProducts.map((product: any, i: number) => {
              const worthItPct = product.worth_it_pct ?? 0
              const topLabels = (product.labels || []).slice(0, 2)
              return (
                <Link key={product.id} to={`/product/${product.id}`} className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors border-b border-neutral-50 dark:border-neutral-700/50 last:border-0 active:scale-[0.99]">
                  <span className={`w-7 text-center font-bold text-sm shrink-0 ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-neutral-400' : i === 2 ? 'text-orange-500' : 'text-neutral-300'}`}>#{i + 1}</span>
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0"><img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{product.name}</h3>
                    {topLabels.length > 0 && (
                      <div className="flex gap-1 mb-1">
                        {topLabels.map((l: any) => (
                          <span key={l.label} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${LABEL_COLORS[l.label] || 'bg-neutral-100 text-neutral-600'}`}>{LABEL_ICONS[l.label] || ''} {l.label}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                      {product.price_range && <span className="font-semibold text-neutral-700 dark:text-neutral-300">{product.price_range}</span>}
                      {worthItPct > 0 && <span className="text-green-600 font-medium">{worthItPct}% worth it</span>}
                      {product.rating_count > 0 && <span>{product.rating_count} ratings</span>}
                      {sortMode === 'elo' && product.matches_played > 0 && <span className="text-purple-500 flex items-center gap-0.5"><SwordsIcon size={8} /> {Math.round(product.elo_score ?? 1500)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAuthenticated && (
                      trySuccess === product.id ? (
                        <span className="text-green-500"><CheckCircle2Icon size={16} /></span>
                      ) : (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); tryMutation.mutate(product.id) }} className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-400 hover:text-purple-600 active:scale-90 transition-all" title="I've tried this"><CheckCircle2Icon size={14} /></button>
                      )
                    )}
                    <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                    <ChevronRightIcon size={14} className="text-neutral-300" />
                  </div>
                </Link>
              )
            })
          )}
        </div>

        {isAuthenticated && (
          <div className="mb-4">
            {showAddProduct ? (
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-4 animate-scale-in">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold dark:text-neutral-100">Add a Product</h3>
                  <button onClick={() => setShowAddProduct(false)} className="text-xs text-neutral-400">Cancel</button>
                </div>
                <input type="text" placeholder="Product name *" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} className="w-full p-2.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2" />
                <div className="flex gap-2 mb-2">
                  <input type="text" placeholder="Price (e.g. $4-6)" value={newProductPrice} onChange={(e) => setNewProductPrice(e.target.value)} className="flex-1 p-2.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  <input type="text" placeholder="Image URL (optional)" value={newProductImage} onChange={(e) => setNewProductImage(e.target.value)} className="flex-1 p-2.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <textarea placeholder="Description (optional)" value={newProductDesc} onChange={(e) => setNewProductDesc(e.target.value)} className="w-full p-2.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-14 mb-2" />
                <button onClick={() => { if (newProductName.trim().length >= 2) addProductMutation.mutate({ name: newProductName.trim(), brand_id: id!, price_range: newProductPrice || undefined, description: newProductDesc || undefined, image_url: newProductImage || undefined }) }} disabled={newProductName.trim().length < 2 || addProductMutation.isPending} className="w-full bg-purple-600 text-white text-sm py-2.5 rounded-lg font-medium hover:bg-purple-700 active:scale-[0.98] transition-all disabled:opacity-50">
                  {addProductMutation.isPending ? 'Adding...' : 'Add Product'}
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAddProduct(true)} className="flex items-center gap-2 w-full justify-center py-3 border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl text-sm text-neutral-500 hover:text-purple-600 hover:border-purple-300 dark:hover:border-purple-700 transition-colors active:scale-[0.98]">
                <PlusCircleIcon size={16} />
                Add a product to this brand
              </button>
            )}
          </div>
        )}

        {sortedProducts.length > 0 && (
          <p className="text-[10px] text-neutral-400 text-center mb-5">Ranked by community tier ratings &middot; Bayesian-adjusted for rating count</p>
        )}

        {brand.products.length >= 2 && (
          <Link to={`/matchup?category=${encodeURIComponent(brand.category)}`} className="block bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border border-purple-100 dark:border-purple-800 p-4 mb-5 hover:shadow-sm transition-all active:scale-[0.98]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center shrink-0"><SwordsIcon size={20} className="text-purple-600 dark:text-purple-400" /></div>
              <div>
                <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Help rank {brand.category} products</p>
                <p className="text-xs text-neutral-500">Head-to-head comparisons make rankings more accurate</p>
              </div>
              <ChevronRightIcon size={16} className="text-neutral-400 ml-auto shrink-0" />
            </div>
          </Link>
        )}

        {overallRatingCount > 0 && (
          <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-4 mb-5">
            <h3 className="font-semibold text-sm dark:text-neutral-100 mb-3 flex items-center gap-1.5">
              <TrendingUpIcon size={14} className="text-purple-500" />
              Brand Ratings
            </h3>
            <div className="space-y-1.5">
              {TIER_OPTIONS.map(tier => {
                const totals: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
                for (const p of brand.products) { if (p.rating_count > 0) totals[p.tier] = (totals[p.tier] || 0) + p.rating_count }
                const count = totals[tier] || 0
                const pct = overallRatingCount > 0 ? Math.round((count / overallRatingCount) * 100) : 0
                return (
                  <div key={tier} className="flex items-center gap-2">
                    <TierBadge tier={tier} size="sm" showEmoji={false} />
                    <div className="flex-1"><div className="h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${TIER_CONFIG[tier].gradient}`} style={{ width: `${pct}%`, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} /></div></div>
                    <span className="text-xs text-neutral-500 w-8 text-right">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
