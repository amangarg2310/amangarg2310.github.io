import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPinIcon } from 'lucide-react'
import { TierBadge } from './TierBadge'
import type { TierType } from '../data/types'

export const LABEL_COLORS: Record<string, string> = {
  'Most Popular': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  'Best Tasting': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  'Known For': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  'Best Looking': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
  'Spiciest': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  'Best Value': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  'Most Unique': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  'Biggest Portion': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  'Must Try': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
}

interface DishCardProps {
  id: string
  name: string
  imageUrl: string
  tier: TierType
  location: string
  restaurant: string
  ratingCount: number
  distance?: number | null
  size?: 'sm' | 'md' | 'lg'
  labels?: { label: string; count: number }[]
}

export function DishCard({
  id, name, imageUrl, tier, location, restaurant, ratingCount, distance, size = 'md', labels,
}: DishCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)

  const sizeClasses = { sm: 'h-32', md: 'h-52', lg: 'h-64' }
  const topLabels = labels?.filter(l => l.count >= 1).slice(0, 2) || []

  return (
    <Link
      to={`/dish/${id}`}
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
        <h3 className={`font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-1 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{name}</h3>
        <p className={`text-neutral-500 ${size === 'sm' ? 'text-[10px] mb-1' : 'text-sm mb-2'}`}>{restaurant}</p>
        <div className="flex items-center justify-between">
          <div className={`flex items-center text-neutral-400 ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>
            <MapPinIcon size={size === 'sm' ? 10 : 14} className="mr-0.5 shrink-0" />
            <span className="line-clamp-1">{distance !== null && distance !== undefined ? `${distance.toFixed(1)} mi` : location}</span>
          </div>
          {size !== 'sm' && <span className="text-xs text-neutral-400">{ratingCount} ratings</span>}
        </div>
      </div>
    </Link>
  )
}
