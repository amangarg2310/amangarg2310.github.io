import { useState, useRef } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MapPinIcon, ChevronLeftIcon, HeartIcon, ShareIcon,
  MessageSquareIcon, ThumbsUpIcon, UsersIcon, ChevronRightIcon,
  TagIcon, CheckIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { DishCard } from '../components/DishCard'
import { LABEL_COLORS } from '../components/DishCard'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { TIER_CONFIG, TIER_OPTIONS } from '../data/types'
import type { TierType } from '../data/types'

export function DishDetailPage() {
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

  const { data: dish, isLoading } = useQuery({
    queryKey: ['dish', id],
    queryFn: () => api.dishes.get(id!),
    enabled: !!id,
  })

  const rateMutation = useMutation({
    mutationFn: ({ tier }: { tier: string }) => api.dishes.rate(id!, tier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dish', id] })
      queryClient.invalidateQueries({ queryKey: ['dishes'] })
      setSubmitted(true)
      setShowEmoji(true)
      setTimeout(() => setShowEmoji(false), 800)
    },
  })

  const favoriteMutation = useMutation({
    mutationFn: () => api.dishes.toggleFavorite(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dish', id] }),
  })

  const reviewMutation = useMutation({
    mutationFn: (data: { tier: string; text: string }) => api.dishes.addReview(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dish', id] })
      setShowReviewForm(false)
      setReviewText('')
    },
  })

  const helpfulMutation = useMutation({
    mutationFn: (reviewId: string) => api.dishes.markHelpful(reviewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dish', id] }),
  })

  const { data: labelsData } = useQuery({
    queryKey: ['dish-labels', id],
    queryFn: () => api.dishes.getLabels(id!),
    enabled: !!id,
  })

  const labelMutation = useMutation({
    mutationFn: (label: string) => api.dishes.toggleLabel(id!, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dish-labels', id] })
      queryClient.invalidateQueries({ queryKey: ['dish', id] })
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

  if (!dish) return <Navigate to="/" replace />

  const images = dish.images.length > 0 ? dish.images : [dish.image_url]
  const worthItPercent = dish.rating_count > 0
    ? Math.round(((dish.ratings.S + dish.ratings.A) / dish.rating_count) * 100)
    : 0

  const handleLike = () => {
    if (!isAuthenticated) return
    if (!dish.is_favorite) {
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
        title: `${dish.name} - biteclimb`,
        text: `Check out ${dish.name} at ${dish.restaurant}! Rated ${dish.tier}-tier on biteclimb`,
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

  return (
    <div className="pb-20 page-enter">
      <div className="relative h-72 w-full overflow-hidden"
        onTouchStart={images.length > 1 ? handleImgTouchStart : undefined}
        onTouchMove={images.length > 1 ? handleImgTouchMove : undefined}
        onTouchEnd={images.length > 1 ? handleImgTouchEnd : undefined}
      >
        {!imageLoaded && <div className="absolute inset-0 skeleton" />}
        <img src={images[activeImageIndex]} alt={dish.name}
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
          <button className={`backdrop-blur-sm rounded-full p-2 transition-all ${dish.is_favorite ? 'bg-red-500 text-white' : 'bg-black/30 text-white'} ${heartAnimating ? 'animate-heart-pulse' : ''}`} onClick={handleLike} aria-label="Save to favorites">
            <HeartIcon size={20} fill={dish.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button onClick={handleShare} className="bg-black/30 backdrop-blur-sm rounded-full p-2 text-white active:scale-90 transition-transform" aria-label="Share">
            <ShareIcon size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4">
        <div className="flex items-start justify-between mt-4 mb-2 animate-fade-in-up">
          <div className="flex-1 min-w-0 mr-3">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{dish.name}</h1>
            <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              <span className="font-medium mr-2">{dish.restaurant}</span>
              <span className="flex items-center"><MapPinIcon size={14} className="mr-0.5" />{dish.location}</span>
            </div>
            {dish.distance !== null && <span className="text-xs text-blue-600 font-medium">{dish.distance.toFixed(1)} mi away</span>}
          </div>
          <TierBadge tier={dish.tier as TierType} size="lg" />
        </div>

        <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4 animate-fade-in-up stagger-1">{dish.description}</p>

        <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3 mb-5 animate-fade-in-up stagger-2">
          <span className="text-lg font-bold dark:text-neutral-100">{dish.price}</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500 flex items-center gap-1"><UsersIcon size={14} /> {dish.rating_count}</span>
            {worthItPercent > 0 && <span className="text-green-600 font-medium text-xs bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">{worthItPercent}% worth it</span>}
          </div>
        </div>

        {/* Dish Labels */}
        {dish.labels && dish.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4 animate-fade-in-up stagger-2">
            {dish.labels.map(l => (
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
              What makes this dish stand out?
            </h2>
            <p className="text-xs text-neutral-500 mb-3">Tap labels that describe this dish</p>
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
              const count = dish.ratings[tier] || 0
              const pct = dish.rating_count > 0 ? Math.round((count / dish.rating_count) * 100) : 0
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
          <h2 className="font-semibold mb-1 text-sm dark:text-neutral-100">{dish.user_rating ? `You rated this ${dish.user_rating}-tier` : "What's your rating?"}</h2>
          <p className="text-xs text-neutral-500 mb-3">Tap a tier to rate this dish</p>
          <div className="flex justify-between gap-1">
            {TIER_OPTIONS.map((tier) => (
              <button key={tier} onClick={() => { setSelectedTier(tier); setSubmitted(false) }} className={`flex-1 py-2.5 rounded-lg transition-all duration-200 flex flex-col items-center ${(selectedTier === tier || (!selectedTier && dish.user_rating === tier)) ? 'bg-white dark:bg-neutral-800 shadow-md scale-105' : 'hover:bg-white/50 active:scale-95'}`}>
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
            <h2 className="font-semibold text-sm dark:text-neutral-100">Reviews ({dish.reviews?.length || 0})</h2>
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
            {dish.reviews?.map((review) => (
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
        {dish.similar && dish.similar.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-sm dark:text-neutral-100">You Might Also Like</h2><ChevronRightIcon size={16} className="text-neutral-400" /></div>
            <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 pb-1">
                {dish.similar.map((d) => (
                  <div key={d.id} className="shrink-0 w-40">
                    <DishCard id={d.id} name={d.name} imageUrl={d.image_url} tier={d.tier as TierType} location={d.location} restaurant={d.restaurant || d.restaurant_name} ratingCount={d.rating_count} size="sm" />
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
