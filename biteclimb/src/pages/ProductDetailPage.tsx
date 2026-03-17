import { useState, useRef } from 'react'
import { useParams, Navigate, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeftIcon, HeartIcon, ShareIcon,
  MessageSquareIcon, ThumbsUpIcon, UsersIcon, ChevronRightIcon,
  TagIcon, CheckIcon, SwordsIcon, TrophyIcon, CheckCircle2Icon,
  ShieldCheckIcon, UsersRoundIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { ProductCard } from '../components/ProductCard'
import { LABEL_COLORS } from '../components/ProductCard'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { TIER_CONFIG, TIER_OPTIONS } from '../data/types'
import type { TierType } from '../data/types'

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const [selectedTier, setSelectedTier] = useState<TierType | null>(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [heartAnimating, setHeartAnimating] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewText, setReviewText] = useState('')

  const touchStartRef = useRef(0)
  const [imgSwipeOffset, setImgSwipeOffset] = useState(0)
  const [imgSwiping, setImgSwiping] = useState(false)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.products.get(id!),
    enabled: !!id,
  })

  const rateMutation = useMutation({
    mutationFn: ({ tier }: { tier: string }) => api.products.rate(id!, tier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setSubmitted(true)
      setShowEmoji(true)
      setTimeout(() => setShowEmoji(false), 800)
    },
  })

  const favoriteMutation = useMutation({
    mutationFn: () => api.products.toggleFavorite(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', id] }),
  })

  const reviewMutation = useMutation({
    mutationFn: (data: { tier: string; text: string }) => api.products.addReview(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      setShowReviewForm(false)
      setReviewText('')
    },
  })

  const helpfulMutation = useMutation({
    mutationFn: (reviewId: string) => api.products.markHelpful(reviewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', id] }),
  })

  const { data: labelsData } = useQuery({
    queryKey: ['product-labels', id],
    queryFn: () => api.products.getLabels(id!),
    enabled: !!id,
  })

  const labelMutation = useMutation({
    mutationFn: (label: string) => api.products.toggleLabel(id!, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-labels', id] })
      queryClient.invalidateQueries({ queryKey: ['product', id] })
    },
  })

  const [showTryForm, setShowTryForm] = useState(false)
  const [tryNotes, setTryNotes] = useState('')
  const [tryPhoto, setTryPhoto] = useState('')
  const [trySuccess, setTrySuccess] = useState(false)

  const tryMutation = useMutation({
    mutationFn: (data: { photo_url?: string; notes?: string }) => api.products.markTried(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['tries'] })
      setTrySuccess(true)
      setShowTryForm(false)
      setTryNotes('')
      setTryPhoto('')
      setTimeout(() => setTrySuccess(false), 2000)
    },
  })

  if (isLoading) {
    return (
      <div className="pb-20 page-enter">
        <div className="h-72 w-full skeleton" />
        <div className="max-w-md mx-auto px-4 space-y-4 mt-4">
          <div className="skeleton h-8 w-3/4 rounded-lg" />
          <div className="skeleton h-4 w-1/2 rounded-lg" />
          <div className="skeleton h-32 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!product) return <Navigate to="/" replace />

  const images = product.images.length > 0 ? product.images : [product.image_url]
  const worthItPercent = product.rating_count > 0
    ? Math.round(((product.ratings.S + product.ratings.A) / product.rating_count) * 100)
    : 0

  const handleLike = () => {
    if (!isAuthenticated) return
    if (!product.is_favorite) {
      setHeartAnimating(true)
      setTimeout(() => setHeartAnimating(false), 400)
    }
    favoriteMutation.mutate()
  }

  const handleSubmitRating = () => {
    if (!selectedTier || !isAuthenticated) return
    rateMutation.mutate({ tier: selectedTier })
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `${product.name} - biteclimb`,
        text: `Check out ${product.name} by ${product.brand}! Rated ${product.tier}-tier on biteclimb`,
        url: window.location.href,
      }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
    }
  }

  const handleImgTouchStart = (e: React.TouchEvent) => { touchStartRef.current = e.touches[0].clientX; setImgSwiping(true) }
  const handleImgTouchMove = (e: React.TouchEvent) => { if (!imgSwiping) return; setImgSwipeOffset(e.touches[0].clientX - touchStartRef.current) }
  const handleImgTouchEnd = () => {
    setImgSwiping(false)
    if (imgSwipeOffset < -50 && activeImageIndex < images.length - 1) setActiveImageIndex(i => i + 1)
    else if (imgSwipeOffset > 50 && activeImageIndex > 0) setActiveImageIndex(i => i - 1)
    setImgSwipeOffset(0)
  }

  // Seed tier / community indicator
  const ratingLabel = product.rating_count < 5 ? 'Consensus' : 'Community'

  return (
    <div className="pb-20 page-enter">
      <div className="relative h-72 w-full overflow-hidden"
        onTouchStart={images.length > 1 ? handleImgTouchStart : undefined}
        onTouchMove={images.length > 1 ? handleImgTouchMove : undefined}
        onTouchEnd={images.length > 1 ? handleImgTouchEnd : undefined}
      >
        {!imageLoaded && <div className="absolute inset-0 skeleton" />}
        <img src={images[activeImageIndex]} alt={product.name}
          className={`h-full w-full object-cover transition-all duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={imgSwiping ? { transform: `translateX(${imgSwipeOffset}px)` } : undefined}
          onLoad={() => setImageLoaded(true)}
        />
        {images.length > 1 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button key={i} onClick={() => setActiveImageIndex(i)} className={`rounded-full transition-all duration-300 ${i === activeImageIndex ? 'bg-white w-5 h-2' : 'bg-white/50 w-2 h-2'}`} />
            ))}
          </div>
        )}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-3 flex gap-1.5">
            {images.map((img, i) => (
              <button key={i} onClick={() => setActiveImageIndex(i)} className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all duration-200 ${i === activeImageIndex ? 'border-white scale-105' : 'border-transparent opacity-60'}`}>
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 bg-black/30 backdrop-blur-sm rounded-full p-2 text-white active:scale-90 transition-transform" aria-label="Go back">
          <ChevronLeftIcon size={24} />
        </button>
        <div className="absolute top-4 right-4 flex space-x-2">
          <button className={`backdrop-blur-sm rounded-full p-2 transition-all ${product.is_favorite ? 'bg-red-500 text-white' : 'bg-black/30 text-white'} ${heartAnimating ? 'animate-heart-pulse' : ''}`} onClick={handleLike} aria-label="Save to favorites">
            <HeartIcon size={20} fill={product.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button onClick={handleShare} className="bg-black/30 backdrop-blur-sm rounded-full p-2 text-white active:scale-90 transition-transform" aria-label="Share">
            <ShareIcon size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4">
        <div className="flex items-start justify-between mt-4 mb-2 animate-fade-in-up">
          <div className="flex-1 min-w-0 mr-3">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{product.name}</h1>
            <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              <Link to={`/brand/${product.brand_id}`} className="font-medium mr-2 hover:text-purple-600 transition-colors">{product.brand}</Link>
              <span className="text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded-full">{product.category}</span>
            </div>
          </div>
          <TierBadge tier={product.tier as TierType} size="lg" />
        </div>

        {/* Seed tier / Community indicator */}
        <div className="flex items-center gap-2 mb-2 animate-fade-in-up stagger-1">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            ratingLabel === 'Consensus'
              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          }`}>
            {ratingLabel === 'Consensus' ? <ShieldCheckIcon size={12} /> : <UsersRoundIcon size={12} />}
            {ratingLabel} Rating
          </span>
          {product.friends_rated_count > 0 && (
            <span className="text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
              <UsersIcon size={12} />
              {product.friends_rated_count} friend{product.friends_rated_count !== 1 ? 's' : ''} rated this
            </span>
          )}
        </div>

        <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4 animate-fade-in-up stagger-1">{product.description}</p>

        <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3 mb-3 animate-fade-in-up stagger-2">
          <div className="flex items-center gap-2">
            {product.price_range && <span className="text-lg font-bold dark:text-neutral-100">{product.price_range}</span>}
            {product.size && <span className="text-sm text-neutral-500">{product.size}</span>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500 flex items-center gap-1"><UsersIcon size={14} /> {product.rating_count}</span>
            {worthItPercent > 0 && <span className="text-green-600 font-medium text-xs bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">{worthItPercent}% worth it</span>}
          </div>
        </div>

        {/* I've Tried This */}
        <div className="mb-4 animate-fade-in-up stagger-2">
          {trySuccess ? (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 animate-scale-in">
              <CheckCircle2Icon size={18} className="text-green-500" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">Marked as tried!</span>
              {!product.user_rating && <span className="text-xs text-green-600 dark:text-green-400 ml-auto">Now rate it below</span>}
            </div>
          ) : showTryForm ? (
            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-4 animate-scale-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold dark:text-neutral-100">I've Tried This</h3>
                <button onClick={() => setShowTryForm(false)} className="text-xs text-neutral-400">Cancel</button>
              </div>
              <input
                type="text"
                placeholder="Paste a photo link (optional)"
                value={tryPhoto}
                onChange={(e) => setTryPhoto(e.target.value)}
                className="w-full p-2.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
              />
              <textarea
                placeholder="Quick notes -- what'd you think? (optional)"
                value={tryNotes}
                onChange={(e) => setTryNotes(e.target.value.slice(0, 280))}
                className="w-full p-2.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-16"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-neutral-400">{tryNotes.length}/280</span>
                <button
                  onClick={() => tryMutation.mutate({ photo_url: tryPhoto || undefined, notes: tryNotes || undefined })}
                  disabled={tryMutation.isPending}
                  className="bg-purple-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {tryMutation.isPending ? 'Saving...' : "I've Tried This"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => isAuthenticated && setShowTryForm(true)}
                className="flex items-center gap-2 bg-purple-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-purple-700 active:scale-95 transition-all"
              >
                <CheckCircle2Icon size={16} />
                I've Tried This
              </button>
              {product.try_count > 0 && (
                <span className="text-xs text-neutral-500">{product.try_count} {product.try_count !== 1 ? 'tries' : 'try'}</span>
              )}
              {product.user_try_count > 0 && (
                <span className="text-xs text-purple-500 font-medium">You: {product.user_try_count}x</span>
              )}
            </div>
          )}
        </div>

        {/* ELO rank + Compare CTA */}
        <div className="flex items-center gap-2 mb-5 animate-fade-in-up stagger-2">
          {product.category_elo_rank && product.category_elo_total && (
            <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-lg px-3 py-2 flex-1">
              <TrophyIcon size={14} className="text-purple-500 shrink-0" />
              <div>
                <p className="text-[10px] text-purple-500 font-medium">H2H Rank</p>
                <p className="text-sm font-bold text-purple-700 dark:text-purple-300">
                  #{product.category_elo_rank} of {product.category_elo_total} {product.category}
                </p>
              </div>
            </div>
          )}
          {product.matches_played !== undefined && product.matches_played > 0 && (
            <div className="flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-lg px-3 py-2">
              <SwordsIcon size={14} className="text-neutral-400 shrink-0" />
              <div>
                <p className="text-[10px] text-neutral-400 font-medium">Matches</p>
                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">{product.matches_played}</p>
              </div>
            </div>
          )}
          <Link
            to={`/matchup?category=${encodeURIComponent(product.category || '')}`}
            className="flex items-center gap-1.5 bg-purple-600 text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-purple-700 active:scale-95 transition-all shrink-0"
          >
            <SwordsIcon size={12} />
            Compare
          </Link>
        </div>

        {/* Product Labels */}
        {product.labels && product.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4 animate-fade-in-up stagger-2">
            {product.labels.map(l => (
              <span
                key={l.label}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LABEL_COLORS[l.label] || 'bg-neutral-100 text-neutral-700'}`}
              >
                {l.label} {l.count > 1 && <span className="opacity-60">({l.count})</span>}
              </span>
            ))}
          </div>
        )}

        {/* Label Voting */}
        {labelsData && (
          <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-4 mb-5 animate-fade-in-up stagger-3">
            <h2 className="font-semibold mb-2 text-sm dark:text-neutral-100 flex items-center gap-1.5">
              <TagIcon size={14} className="text-purple-500" />
              What makes this product stand out?
            </h2>
            <p className="text-xs text-neutral-500 mb-3">Tap labels that describe this product</p>
            <div className="flex flex-wrap gap-2">
              {labelsData.valid_labels.map(label => {
                const isActive = labelsData.user_labels.includes(label)
                const communityCount = labelsData.labels.find(l => l.label === label)?.count || 0
                return (
                  <button
                    key={label}
                    onClick={() => { if (isAuthenticated) labelMutation.mutate(label) }}
                    className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition-all duration-200 flex items-center gap-1 active:scale-95 ${
                      isActive
                        ? `${LABEL_COLORS[label] || 'bg-purple-100 text-purple-700'} ring-2 ring-purple-300 dark:ring-purple-600`
                        : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200'
                    }`}
                  >
                    {isActive && <CheckIcon size={10} />}
                    {label}
                    {communityCount > 0 && <span className="opacity-60">({communityCount})</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Ratings */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-4 mb-5 animate-fade-in-up stagger-3">
          <h2 className="font-semibold mb-3 text-sm dark:text-neutral-100">Community Ratings</h2>
          <div className="space-y-2">
            {TIER_OPTIONS.map((tier) => {
              const count = product.ratings[tier] || 0
              const pct = product.rating_count > 0 ? Math.round((count / product.rating_count) * 100) : 0
              return (
                <div key={tier} className="flex items-center">
                  <TierBadge tier={tier} size="sm" showEmoji={false} />
                  <div className="ml-3 flex-1"><div className="h-2.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${TIER_CONFIG[tier].gradient}`} style={{ width: `${pct}%`, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} /></div></div>
                  <span className="ml-2 text-xs text-neutral-500 w-8 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Rate */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl p-4 mb-5 animate-fade-in-up stagger-4 relative overflow-hidden">
          {showEmoji && selectedTier && <div className="absolute top-2 left-1/2 -translate-x-1/2 text-2xl animate-float-up pointer-events-none">{TIER_CONFIG[selectedTier].emoji}</div>}
          <h2 className="font-semibold mb-1 text-sm dark:text-neutral-100">{product.user_rating ? `You rated this ${product.user_rating}-tier` : "What's your rating?"}</h2>
          <p className="text-xs text-neutral-500 mb-3">Tap a tier to rate this product</p>
          <div className="flex justify-between gap-1">
            {TIER_OPTIONS.map((tier) => (
              <button key={tier} onClick={() => { setSelectedTier(tier); setSubmitted(false) }} className={`flex-1 py-2.5 rounded-lg transition-all duration-200 flex flex-col items-center ${(selectedTier === tier || (!selectedTier && product.user_rating === tier)) ? 'bg-white dark:bg-neutral-800 shadow-md scale-105' : 'hover:bg-white/50 active:scale-95'}`}>
                <TierBadge tier={tier} size="sm" showEmoji={false} />
                <span className="text-[10px] text-neutral-500 mt-1">{TIER_CONFIG[tier].label}</span>
              </button>
            ))}
          </div>
          <button className={`w-full py-3 mt-3 rounded-xl font-medium text-sm transition-all duration-300 ${submitted ? 'bg-green-500 text-white animate-confetti-pop' : selectedTier ? 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.97]' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-not-allowed'}`} disabled={!selectedTier || submitted || rateMutation.isPending} onClick={handleSubmitRating}>
            {submitted ? '✓ Rating Submitted!' : rateMutation.isPending ? 'Submitting...' : 'Submit Rating'}
          </button>
        </div>

        {/* Reviews */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm dark:text-neutral-100">Reviews ({product.reviews?.length || 0})</h2>
            <button onClick={() => setShowReviewForm(!showReviewForm)} className="text-xs font-medium text-purple-600 flex items-center gap-0.5 active:scale-95 transition-transform"><MessageSquareIcon size={14} /> Write a review</button>
          </div>
          {showReviewForm && (
            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-3 mb-3 animate-scale-in">
              <textarea placeholder="Share your thoughts..." value={reviewText} onChange={(e) => setReviewText(e.target.value)} className="w-full p-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-20" />
              <button onClick={() => { if (selectedTier && reviewText.trim()) reviewMutation.mutate({ tier: selectedTier, text: reviewText }) }} disabled={!selectedTier || !reviewText.trim() || reviewMutation.isPending} className="mt-2 bg-purple-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">{reviewMutation.isPending ? 'Posting...' : 'Post Review'}</button>
              {!selectedTier && <p className="text-xs text-neutral-500 mt-1">Select a tier rating above first</p>}
            </div>
          )}
          <div className="space-y-3">
            {product.reviews?.map((review) => (
              <div key={review.id} className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <img src={review.avatar} alt={review.username} className="w-8 h-8 rounded-full object-cover" />
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm dark:text-neutral-100">{review.username}</span><TierBadge tier={review.tier as TierType} size="sm" showEmoji={false} /></div><span className="text-xs text-neutral-400">{new Date(review.created_at).toLocaleDateString()}</span></div>
                </div>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-2">{review.text}</p>
                <button onClick={() => helpfulMutation.mutate(review.id)} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-purple-600 active:scale-95 transition-all"><ThumbsUpIcon size={12} /> Helpful ({review.helpful})</button>
              </div>
            ))}
          </div>
        </div>

        {/* Similar */}
        {product.similar && product.similar.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-sm dark:text-neutral-100">You Might Also Like</h2><ChevronRightIcon size={16} className="text-neutral-400" /></div>
            <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 pb-1">
                {product.similar.map((d) => (
                  <div key={d.id} className="shrink-0 w-40">
                    <ProductCard id={d.id} name={d.name} imageUrl={d.image_url} tier={d.tier as TierType} brand={d.brand || d.brand_name} category={d.category} ratingCount={d.rating_count} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
