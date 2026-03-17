import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  SearchIcon, TrendingUpIcon, FlameIcon,
  SparklesIcon, UsersIcon, TrophyIcon,
  ZapIcon, PlusCircleIcon, CameraIcon,
} from 'lucide-react'
import { ProductCard } from '../components/ProductCard'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import type { TierType } from '../data/types'
import type { TrendingBrandData, CategoryData } from '../api/client'

export function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sort, setSort] = useState<'top' | 'trending'>('top')

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  })

  const categoryFilterOptions = ['All', ...categories.map((c: CategoryData) => c.name)]

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', selectedCategory, searchTerm, sort],
    queryFn: () => api.products.list({
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      search: searchTerm || undefined,
      sort,
    }),
  })

  const { data: trending = [] } = useQuery({
    queryKey: ['trending-brands'],
    queryFn: () => api.brands.trending(),
  })

  const isSearching = searchTerm.length > 0 || selectedCategory !== 'All'

  const trendingProducts = [...products]
    .filter(d => (d.trending_delta ?? 0) > 0)
    .sort((a, b) => (b.trending_delta ?? 0) - (a.trending_delta ?? 0))
    .slice(0, 5)

  const topRated = products
    .filter(d => d.tier === 'S')
    .sort((a, b) => b.rating_count - a.rating_count)
    .slice(0, 5)

  const featuredProduct = products.find(d => d.tier === 'S' && (d.trending_delta ?? 0) > 5) || products[0]

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      {/* Header */}
      <header className="mb-5 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">biteclimb</h1>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" aria-label="Scan product">
              <CameraIcon size={20} className="text-neutral-600 dark:text-neutral-400" />
            </button>
          </div>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">Find the best products, rated by the community</p>
      </header>

      {/* Search */}
      <div className="relative mb-5 animate-fade-in-up stagger-1">
        <SearchIcon size={18} className="absolute left-3 top-3 text-neutral-400" />
        <input
          type="text"
          placeholder="Search products, brands, or categories..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Category filter chips */}
      <div className="mb-5 -mx-4 px-4 overflow-x-auto scrollbar-hide animate-fade-in-up stagger-2">
        <div className="flex space-x-2 pb-1">
          {categoryFilterOptions.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-purple-600 text-white'
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
            <div key={i} className="skeleton h-48 rounded-2xl" />
          ))}
        </div>
      ) : isSearching ? (
        <>
          {/* Sort tabs */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {([['top', 'Top'], ['trending', 'Hot']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                    sort === key ? 'bg-purple-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-neutral-500 mb-3">{products.length} results</p>
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                imageUrl={product.image_url}
                tier={product.tier as TierType}
                brand={product.brand}
                category={product.category}
                ratingCount={product.rating_count}
                labels={product.labels}
                size="sm"
              />
            ))}
            {products.length === 0 && (
              <div className="col-span-2 text-center py-12 text-neutral-500">
                <SearchIcon size={32} className="mx-auto mb-2 opacity-40" />
                <p className="font-medium">No products found</p>
                <p className="text-sm mt-1">Try a different search or category</p>
                <Link
                  to="/add-product"
                  className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-medium hover:bg-purple-700 active:scale-95 transition-all"
                >
                  <PlusCircleIcon size={14} />
                  Add a Product
                </Link>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Discovery feed */
        <div className="space-y-6">
          {/* Hero */}
          {featuredProduct && (
            <Link to={`/product/${featuredProduct.id}`} className="block relative rounded-2xl overflow-hidden h-48 group">
              <img src={featuredProduct.image_url} alt={featuredProduct.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <FlameIcon size={12} /> HOT
                </span>
                {featuredProduct.trending_delta > 0 && (
                  <span className="bg-black/40 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
                    +{featuredProduct.trending_delta} this week
                  </span>
                )}
              </div>
              <div className="absolute top-3 right-3">
                <TierBadge tier={featuredProduct.tier as TierType} size="sm" showEmoji={false} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h2 className="text-white font-bold text-lg leading-tight">{featuredProduct.name}</h2>
                <p className="text-white/80 text-sm">{featuredProduct.brand} · {featuredProduct.category}</p>
                <p className="text-white/60 text-xs mt-1 flex items-center gap-1">
                  <UsersIcon size={12} />
                  {featuredProduct.today_ratings} people rated this today
                </p>
              </div>
            </Link>
          )}

          {/* Trending */}
          {trendingProducts.length > 0 && (
            <section>
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mb-3">
                <TrendingUpIcon size={18} className="text-red-500" />
                Trending This Week
              </h2>
              <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
                <div className="flex gap-3 pb-1">
                  {trendingProducts.map((product, i) => (
                    <Link key={product.id} to={`/product/${product.id}`} className="shrink-0 w-36 group">
                      <div className="relative h-36 rounded-xl overflow-hidden mb-2">
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{i + 1}</div>
                        <div className="absolute top-2 right-2"><TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} /></div>
                        <div className="absolute bottom-2 left-2">
                          <span className="bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                            <TrendingUpIcon size={10} /> +{product.trending_delta}
                          </span>
                        </div>
                      </div>
                      <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{product.name}</h3>
                      <p className="text-xs text-neutral-500">{product.brand}</p>
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
                {topRated.map((product, i) => (
                  <Link key={product.id} to={`/product/${product.id}`} className="flex items-center p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors border-b border-neutral-50 dark:border-neutral-700 last:border-0">
                    <span className="w-6 text-center font-bold text-neutral-300 text-sm shrink-0">{i + 1}</span>
                    <div className="w-12 h-12 rounded-lg overflow-hidden mx-3 shrink-0">
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{product.name}</h3>
                      <p className="text-xs text-neutral-500">{product.brand} · {product.category}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-xs text-neutral-400">{product.rating_count}</span>
                      <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Hot This Week (Trending Brands) */}
          {(trending as TrendingBrandData[]).length > 0 && (
            <section>
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mb-3">
                <ZapIcon size={18} className="text-orange-500" />
                Hot This Week
              </h2>
              <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
                <div className="flex gap-3 pb-1">
                  {(trending as TrendingBrandData[]).slice(0, 6).map((r) => (
                    <Link
                      key={r.id}
                      to={`/brand/${r.id}`}
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
                            <ZapIcon size={8} /> {r.velocity.toFixed(1)}x
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
                      <p className="text-[10px] text-neutral-500">{r.category}</p>
                      {r.top_product && (
                        <p className="text-[9px] text-purple-600 dark:text-purple-400 line-clamp-1 mt-0.5">
                          ⭐ {r.top_product.name}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Best by Category CTA */}
          <section>
            <Link
              to="/rankings"
              className="block bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 p-4 hover:shadow-sm transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <TrophyIcon size={16} className="text-yellow-500" />
                    Best by Category
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Best products &amp; brands ranked by category</p>
                </div>
                <div className="text-yellow-500">
                  <TrophyIcon size={24} />
                </div>
              </div>
            </Link>
          </section>

          {/* Explore by Category */}
          <section>
            <h2 className="font-bold text-neutral-900 dark:text-neutral-100 mb-3">Explore by Category</h2>
            <div className="grid grid-cols-2 gap-3">
              {categories.slice(0, 6).map((cat: CategoryData) => {
                return (
                  <button key={cat.id} onClick={() => setSelectedCategory(cat.name)} className="relative h-24 rounded-xl overflow-hidden group text-left bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30">
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl mb-1">{cat.emoji}</span>
                      <span className="text-neutral-900 dark:text-neutral-100 font-semibold text-sm">{cat.name}</span>
                      {cat.product_count !== undefined && (
                        <span className="text-neutral-500 text-xs">{cat.product_count} products</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* All Products */}
          <section>
            <h2 className="font-bold text-neutral-900 dark:text-neutral-100 mb-3">All Products</h2>
            <div className="grid grid-cols-2 gap-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  id={product.id}
                  name={product.name}
                  imageUrl={product.image_url}
                  tier={product.tier as TierType}
                  brand={product.brand}
                  category={product.category}
                  ratingCount={product.rating_count}
                  labels={product.labels}
                  size="sm"
                />
              ))}
            </div>
          </section>

          {/* Can't find it? */}
          <section className="text-center py-4">
            <p className="text-sm text-neutral-500 mb-2">Can't find what you're looking for?</p>
            <Link
              to="/add-product"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white rounded-full text-sm font-medium hover:bg-purple-700 active:scale-95 transition-all"
            >
              <PlusCircleIcon size={14} />
              Add a Product
            </Link>
          </section>
        </div>
      )}
    </div>
  )
}
