import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, SwordsIcon, SkipForwardIcon, TrophyIcon } from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import type { TierType } from '../data/types'
import type { CategoryData } from '../api/client'

export function MatchupPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  })

  const categoryNames = categories.map((c: CategoryData) => c.name)

  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get('category') || categoryNames[0] || 'Chips & Snacks'
  )
  const [result, setResult] = useState<{ winnerId: string | null; winnerElo: number | null; loserElo: number | null } | null>(null)
  const [matchCount, setMatchCount] = useState(0)

  const { data: matchup, isLoading, error } = useQuery({
    queryKey: ['matchup', selectedCategory, matchCount],
    queryFn: () => api.products.getMatchup(selectedCategory),
    retry: false,
  })

  const submitMutation = useMutation({
    mutationFn: (data: { product_a_id: string; product_b_id: string; winner_id: string | null; category: string }) =>
      api.products.submitMatchup(data),
    onSuccess: (data, vars) => {
      const winnerId = vars.winner_id
      const isA = winnerId === vars.product_a_id
      setResult({
        winnerId,
        winnerElo: isA ? data.product_a_elo : data.product_b_elo,
        loserElo: isA ? data.product_b_elo : data.product_a_elo,
      })
      queryClient.invalidateQueries({ queryKey: ['matchup', selectedCategory] })
      setTimeout(() => {
        setResult(null)
        setMatchCount(c => c + 1)
      }, 1500)
    },
  })

  function handlePick(winnerId: string | null) {
    if (!matchup || submitMutation.isPending) return
    submitMutation.mutate({
      product_a_id: matchup.product_a.id,
      product_b_id: matchup.product_b.id,
      winner_id: winnerId,
      category: selectedCategory,
    })
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter min-h-screen">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-90 transition-transform"
        >
          <ChevronLeftIcon size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <SwordsIcon size={20} className="text-purple-500" />
            Which is Better?
          </h1>
          <p className="text-neutral-500 text-xs">Head-to-head product rankings</p>
        </div>
      </header>

      <div className="mb-6 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex space-x-2 pb-1">
          {categoryNames.map((category: string) => (
            <button
              key={category}
              onClick={() => { setSelectedCategory(category); setMatchCount(0); setResult(null) }}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="text-center text-neutral-400 text-sm">Loading matchup...</div>
        </div>
      ) : error ? (
        <div className="text-center py-16 text-neutral-500">
          <SwordsIcon size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Not enough products</p>
          <p className="text-sm mt-1">Need at least 2 {selectedCategory} products to compare</p>
          <Link to="/rankings" className="mt-4 inline-block text-purple-600 text-sm font-medium">
            View Rankings &rarr;
          </Link>
        </div>
      ) : matchup ? (
        <div className="space-y-4">
          <div className="text-center text-xs text-neutral-400">
            {matchCount > 0 && `${matchCount} matchup${matchCount > 1 ? 's' : ''} completed this session`}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([matchup.product_a, matchup.product_b] as const).map((product, idx) => {
              const isWinner = result?.winnerId === product.id
              const isLoser = result?.winnerId !== null && result?.winnerId !== product.id && result !== null

              return (
                <button
                  key={product.id}
                  onClick={() => handlePick(product.id)}
                  disabled={!!result || submitMutation.isPending}
                  className={`relative rounded-2xl overflow-hidden transition-all duration-300 active:scale-[0.97] ${
                    isWinner
                      ? 'ring-4 ring-green-400 scale-105 shadow-lg shadow-green-400/20'
                      : isLoser
                      ? 'opacity-50 scale-95'
                      : 'hover:scale-[1.02] hover:shadow-md'
                  }`}
                >
                  <div className="h-48 w-full overflow-hidden">
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute top-2 right-2">
                    <TierBadge tier={product.tier as TierType} size="sm" showEmoji={false} />
                  </div>
                  {isWinner && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrophyIcon size={10} /> WIN
                    </div>
                  )}
                  {result && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                      {isWinner && result.winnerElo && (
                        <span className="text-green-300 font-bold text-lg drop-shadow">{Math.round(result.winnerElo)}</span>
                      )}
                      {isLoser && result.loserElo && (
                        <span className="text-red-300 font-bold text-lg drop-shadow">{Math.round(result.loserElo)}</span>
                      )}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                    <p className="text-white font-bold text-sm line-clamp-2 leading-tight mb-0.5">{product.name}</p>
                    <p className="text-white/70 text-xs line-clamp-1">{product.brand_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      {product.price_range && <span className="text-white/80 text-xs font-medium">{product.price_range}</span>}
                      {product.matches_played > 0 && <span className="text-white/50 text-[10px]">{product.matches_played} matches</span>}
                    </div>
                  </div>
                  <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 flex justify-center pointer-events-none">
                    {!result && !submitMutation.isPending && (
                      <span className={`text-white/40 text-[10px] font-bold uppercase tracking-wider ${idx === 0 ? 'mr-auto pl-2' : 'ml-auto pr-2'}`}>TAP</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-neutral-400 font-bold text-sm">VS</span>
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          </div>

          <button
            onClick={() => handlePick(null)}
            disabled={!!result || submitMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 text-neutral-400 text-sm hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors disabled:opacity-50"
          >
            <SkipForwardIcon size={14} />
            Skip (haven't tried both)
          </button>

          <p className="text-center text-[10px] text-neutral-400 leading-relaxed">
            Your picks help calibrate product rankings &middot; Tap the better product
          </p>
        </div>
      ) : null}
    </div>
  )
}
