import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TagIcon } from 'lucide-react'
import { TierBadge } from './TierBadge'
import type { TierType } from '../data/types'

export const LABEL_COLORS: Record<string, string> = {
  'Most Popular': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  'Best Flavor': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  'Best Value': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  'Most Addictive': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  'Guilty Pleasure': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
  'Healthy Pick': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  'Best Texture': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  'Must Try': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  'Overrated': 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400',
  'Underrated': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  'Best for Sharing': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
}

interface ProductCardProps {
  id: string
  name: string
  imageUrl: string
  tier: TierType
  brand: string
  category?: string
  ratingCount: number
  size?: 'sm' | 'md' | 'lg'
  labels?: { label: string; count: number }[]
  priceRange?: string
}

export function ProductCard({
  id, name, imageUrl, tier, brand, category, ratingCount, size = 'md', labels, priceRange,
}: ProductCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)

  const sizeClasses = { sm: 'h-32', md: 'h-52', lg: 'h-64' }
  const topLabels = labels?.filter(l => l.count >= 1).slice(0, 2) || []

  return (
    <Link
      to={`/product/${id}`}
      className="group block rounded-xl overflow-hidden bg-white dark:bg-neutral-800 shadow-sm hover:shadow-md transition-all duration-300 active:scale-[0.98]"
    >
      <div className={`relative w-full ${sizeClasses[size]} overflow-hidden`}>
        {!imageLoaded && <div className="absolute inset-0 skeleton" />}
        <img
          src={imageUrl}
          alt={name}
          className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
        />
        <div className="absolute top-2 right-2">
          <TierBadge tier={tier} size="sm" showEmoji={false} />
        </div>
        {topLabels.length > 0 && (
          <div className="absolute bottom-2 left-2 flex gap-1">
            {topLabels.map(l => (
              <span
                key={l.label}
                className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm ${LABEL_COLORS[l.label] || 'bg-neutral-100 text-neutral-700'}`}
              >
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={size === 'sm' ? 'p-2' : 'p-3'}>
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <h3 className={`font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-1 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{name}</h3>
          {priceRange && (
            <span className={`font-semibold text-neutral-700 dark:text-neutral-300 shrink-0 ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>{priceRange}</span>
          )}
        </div>
        <p className={`text-neutral-500 ${size === 'sm' ? 'text-[10px] mb-1' : 'text-xs mb-1.5'}`}>{brand}</p>
        <div className="flex items-center justify-between">
          {category && (
            <span className={`flex items-center gap-0.5 text-neutral-400 ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>
              <TagIcon size={size === 'sm' ? 10 : 12} className="shrink-0" />
              <span className="line-clamp-1">{category}</span>
            </span>
          )}
          {size !== 'sm' && <span className="text-xs text-neutral-400">{ratingCount} ratings</span>}
        </div>
      </div>
    </Link>
  )
}
