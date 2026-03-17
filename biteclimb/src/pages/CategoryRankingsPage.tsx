import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  TrophyIcon, ChevronLeftIcon, StarIcon, TrendingUpIcon,
  ZapIcon, ChevronRightIcon, PackageIcon, StoreIcon, SwordsIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import type { TierType } from '../data/types'
import type { CategoryRankedBrand, ProductRankingData } from '../api/client'
import { LABEL_COLORS } from '../components/ProductCard'

const LABEL_ICONS: Record<string, string> = {
  'Must Try': '🔥',
  'Most Popular': '📈',
  'Best Flavor': '🤤',
  'Best Value': '💰',
  'Most Addictive': '🔄',
  'Guilty Pleasure': '😏',
  'Healthy Pick': '🥗',
  'Best Texture': '✨',
}

export function CategoryRankingsPage() {
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [viewMode, setViewMode] = useState<'products' | 'brands' | 'elo'>('products')

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  })

  const categoryChips = ['All', ...categories.map(c => c.name)]

  const { data: brandRankings = {}, isLoading: brandsLoading } = useQuery({
    queryKey: ['brand-rankings', selectedCategory],
    queryFn: () => api.brands.topByCategory(selectedCategory !== 'All' ? selectedCategory : undefined),
    enabled: viewMode === 'brands',
  })

  const { data: productRankings = [], isLoading: productsLoading } = useQuery({
    queryKey: ['product-rankings', selectedCategory],
    queryFn: () => api.products.topByCategory(selectedCategory !== 'All' ? selectedCategory : undefined),
    enabled: viewMode === 'products',
  })

  const { data: eloRankings = [], isLoading: eloLoading } = useQuery({
    queryKey: ['elo-rankings', selectedCategory],
    queryFn: () => api.products.eloRankings(selectedCategory !== 'All' ? selectedCategory : 'All'),
    enabled: viewMode === 'elo',
  })

  const isLoading = viewMode === 'products' ? productsLoading : viewMode === 'brands' ? brandsLoading : eloLoading
  const brandEntries = Object.entries(brandRankings)

  // Group product rankings by category for "All" view
  const productsByCategory: Record<string, ProductRankingData[]> = {}
  if (viewMode === 'products') {
    if (selectedCategory !== 'All') {
      productsByCategory[selectedCategory] = productRankings as ProductRankingData[]
    } else {
      for (const d of productRankings as ProductRankingData[]) {
        if (!productsByCategory[d.category]) productsByCategory[d.category] = []
        productsByCategory[d.category].push(d)
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
              Best by Category
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-xs">Ranked by community ratings</p>
          </div>
        </div>
      </header>

      {/* View mode toggle */}
      <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl mb-5 animate-fade-in-up">
        <button
          onClick={() => setViewMode('products')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            viewMode === 'products'
              ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500'
          }`}
        >
          <PackageIcon size={14} />
          Products
        </button>
        <button
          onClick={() => setViewMode('elo')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            viewMode === 'elo'
              ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500'
          }`}
        >
          <SwordsIcon size={14} />
          ELO
        </button>
        <button
          onClick={() => setViewMode('brands')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            viewMode === 'brands'
              ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500'
          }`}
        >
          <StoreIcon size={14} />
          Brands
        </button>
      </div>

      {/* Category filter */}
      <div className="mb-5 -mx-4 px-4 overflow-x-auto scrollbar-hide animate-fade-in-up stagger-1">
        <div className="flex space-x-2 pb-1">
          {categoryChips.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-yellow-500 text-white'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {cat}
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
      ) : viewMode === 'products' ? (
        /* Community Rankings (products) */
        <div className="space-y-8">
          {Object.entries(productsByCategory).map(([category, products]) => (
            <section key={category} className="animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <StarIcon size={16} className="text-yellow-500" />
                  Best {category}
                  <span className="text-xs font-normal text-neutral-400 ml-1">{products.length} products</span>
                </h2>
                <Link
                  to={`/matchup?category=${encodeURIComponent(category)}`}
                  className="text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-0.5 hover:underline"
                >
                  Help rank &rarr;
                </Link>
              </div>

              <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden">
                {products.slice(0, 10).map((product, i) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors border-b border-neutral-50 dark:border-neutral-700/50 last:border-0 active:scale-[0.99]"
                  >
                    <span className={`w-7 text-center font-bold text-sm shrink-0 ${
                      i === 0 ? 'text-yellow-500' :
                      i === 1 ? 'text-neutral-400' :
                      i === 2 ? 'text-orange-500' :
                      'text-neutral-300'
                    }`}>
                      #{i + 1}
                    </span>

                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{product.name}</h3>
                      <p className="text-[10px] text-neutral-500 line-clamp-1">{product.brand_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {product.labels.slice(0, 1).map(l => (
                          <span key={l.label} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${LABEL_COLORS[l.label] || 'bg-neutral-100 text-neutral-600'}`}>
                            {LABEL_ICONS[l.label] || ''} {l.label}
                          </span>
                        ))}
                        <span className="text-[10px] text-neutral-400">{product.rating_count} ratings</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {product.price_range && (
                        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{product.price_range}</span>
                      )}
                      <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                    </div>

                    <ChevronRightIcon size={14} className="text-neutral-300 shrink-0" />
                  </Link>
                ))}
              </div>

              {products.length === 0 && (
                <div className="text-center py-8 text-neutral-500 text-sm">
                  No {category} products rated yet
                </div>
              )}
            </section>
          ))}

          {Object.keys(productsByCategory).length === 0 && (
            <div className="text-center py-12 text-neutral-500">
              <TrophyIcon size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-medium">No product rankings yet</p>
              <p className="text-sm mt-1">Rate some products to see category rankings</p>
            </div>
          )}
        </div>
      ) : viewMode === 'elo' ? (
        /* ELO Rankings */
        <div className="space-y-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-2">
            <SwordsIcon size={16} className="text-purple-500" />
            <h2 className="font-bold text-neutral-900 dark:text-neutral-100">
              ELO Rankings {selectedCategory !== 'All' ? `- ${selectedCategory}` : ''}
            </h2>
          </div>
          {eloRankings.length > 0 ? (
            <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden">
              {eloRankings.map((product, i) => (
                <Link
                  key={product.product_id}
                  to={`/product/${product.product_id}`}
                  className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors border-b border-neutral-50 dark:border-neutral-700/50 last:border-0 active:scale-[0.99]"
                >
                  <span className={`w-7 text-center font-bold text-sm shrink-0 ${
                    i === 0 ? 'text-yellow-500' :
                    i === 1 ? 'text-neutral-400' :
                    i === 2 ? 'text-orange-500' :
                    'text-neutral-300'
                  }`}>
                    #{product.category_rank}
                  </span>

                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{product.name}</h3>
                    <p className="text-[10px] text-neutral-500">{product.brand_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-purple-500 font-medium flex items-center gap-0.5">
                        <SwordsIcon size={8} /> {Math.round(product.elo_score)} ELO
                      </span>
                      <span className="text-[10px] text-neutral-400">{product.matches_played} matches</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {product.price_range && (
                      <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{product.price_range}</span>
                    )}
                    <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                  </div>

                  <ChevronRightIcon size={14} className="text-neutral-300 shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              <SwordsIcon size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-medium">No ELO rankings yet</p>
              <p className="text-sm mt-1">Play some matchups to generate ELO rankings</p>
              <Link to="/matchup" className="mt-4 inline-block text-purple-600 text-sm font-medium">
                Start Matchups &rarr;
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* Best Brands view */
        <div className="space-y-8">
          {brandEntries.map(([category, brands]) => (
            <section key={category} className="animate-fade-in-up">
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2 mb-3">
                <StarIcon size={16} className="text-yellow-500" />
                Best {category}
                <span className="text-xs font-normal text-neutral-400 ml-1">
                  {brands.length} brands
                </span>
              </h2>
              <div className="space-y-3">
                {brands.map((brand) => (
                  <RankedBrandCard key={brand.id} brand={brand} />
                ))}
              </div>
            </section>
          ))}

          {brandEntries.length === 0 && (
            <div className="text-center py-12 text-neutral-500">
              <TrophyIcon size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-medium">No rankings yet</p>
              <p className="text-sm mt-1">Rate some products to see brand rankings</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RankedBrandCard({ brand }: { brand: CategoryRankedBrand }) {
  const rankColors: Record<number, string> = {
    1: 'from-yellow-400 to-yellow-600',
    2: 'from-neutral-300 to-neutral-500',
    3: 'from-orange-400 to-orange-600',
  }

  return (
    <Link
      to={`/brand/${brand.id}`}
      className="block bg-white dark:bg-neutral-800 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-stretch">
        {/* Rank badge */}
        <div className={`w-10 flex items-center justify-center bg-gradient-to-b ${rankColors[brand.rank] || 'from-neutral-200 to-neutral-400'} shrink-0`}>
          <span className="text-white font-bold text-sm">#{brand.rank}</span>
        </div>

        {/* Image */}
        <div className="w-20 h-20 shrink-0">
          <img src={brand.image_url} alt={brand.name} className="w-full h-full object-cover" loading="lazy" />
        </div>

        {/* Info */}
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{brand.name}</h3>
            <TierBadge tier={brand.community_tier as TierType} size="sm" showEmoji={false} />
            {brand.is_newcomer && (
              <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <ZapIcon size={8} /> NEW
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mb-1.5">{brand.category}</p>

          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-neutral-400">
              {brand.rating_count} ratings
            </span>
            {brand.recent_ratings > 0 && (
              <span className="text-green-600 flex items-center gap-0.5">
                <TrendingUpIcon size={10} /> {brand.recent_ratings} this week
              </span>
            )}
            {brand.velocity > 1.2 && (
              <span className="text-orange-500 flex items-center gap-0.5">
                <ZapIcon size={8} /> Hot
              </span>
            )}
          </div>

          {brand.top_products.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
              {brand.top_products.map(product => (
                <div key={product.id} className="shrink-0 flex items-center gap-1 bg-neutral-50 dark:bg-neutral-700 rounded-full px-2 py-0.5">
                  <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                  <span className="text-[10px] text-neutral-700 dark:text-neutral-300 line-clamp-1 max-w-[80px]">{product.name}</span>
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
