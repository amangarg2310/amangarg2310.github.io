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
  const sizeClasses = {
    sm: 'h-40',
    md: 'h-52',
    lg: 'h-64',
  }

  return (
    <Link
      to={`/dish/${id}`}
      className="group block rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-300"
    >
      <div className={`relative w-full ${sizeClasses[size]} overflow-hidden`}>
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute top-3 right-3">
          <TierBadge tier={tier} size={size === 'lg' ? 'md' : 'sm'} showEmoji={false} />
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-neutral-900 line-clamp-1">{name}</h3>
        <p className="text-sm text-neutral-600 mb-2">{restaurant}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center text-xs text-neutral-500">
            <MapPinIcon size={14} className="mr-1 shrink-0" />
            <span>{location}</span>
          </div>
          <span className="text-xs text-neutral-500">{ratingCount} ratings</span>
        </div>
      </div>
    </Link>
  )
}
