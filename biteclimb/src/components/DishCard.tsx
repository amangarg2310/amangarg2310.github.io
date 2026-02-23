import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPinIcon } from 'lucide-react'
import { TierBadge } from './TierBadge'
import type { TierType } from '../data/types'

interface DishCardProps {
  id: string
  name: string
  imageUrl: string
  tier: TierType
  location: string
  restaurant: string
  ratingCount: number
  size?: 'sm' | 'md' | 'lg'
}

export function DishCard({
  id,
  name,
  imageUrl,
  tier,
  location,
  restaurant,
  ratingCount,
  size = 'md',
}: DishCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)

  const sizeClasses = {
    sm: 'h-32',
    md: 'h-52',
    lg: 'h-64',
  }

  return (
    <Link
      to={`/dish/${id}`}
      className="group block rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-300 active:scale-[0.98]"
    >
      <div className={`relative w-full ${sizeClasses[size]} overflow-hidden`}>
        {!imageLoaded && <div className="absolute inset-0 skeleton" />}
        <img
          src={imageUrl}
          alt={name}
          className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
        />
        <div className="absolute top-2 right-2">
          <TierBadge tier={tier} size="sm" showEmoji={false} />
        </div>
      </div>
      <div className={size === 'sm' ? 'p-2' : 'p-3'}>
        <h3 className={`font-semibold text-neutral-900 line-clamp-1 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          {name}
        </h3>
        <p className={`text-neutral-500 ${size === 'sm' ? 'text-[10px] mb-1' : 'text-sm mb-2'}`}>
          {restaurant}
        </p>
        <div className="flex items-center justify-between">
          <div className={`flex items-center text-neutral-400 ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>
            <MapPinIcon size={size === 'sm' ? 10 : 14} className="mr-0.5 shrink-0" />
            <span className="line-clamp-1">{location}</span>
          </div>
          {size !== 'sm' && (
            <span className="text-xs text-neutral-400">{ratingCount} ratings</span>
          )}
        </div>
      </div>
    </Link>
  )
}
