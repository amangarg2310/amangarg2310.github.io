import { Link } from 'react-router-dom'
import { ChevronRightIcon } from 'lucide-react'
import { TierBadge } from './TierBadge'
import type { TierType } from '../data/types'

interface TierListItem {
  id: string
  name: string
  imageUrl: string
  tier: TierType
  restaurant: string
}

interface TierListProps {
  title: string
  items: TierListItem[]
  author?: string
  showViewAll?: boolean
}

export function TierList({ title, items, author, showViewAll = true }: TierListProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-bold text-lg text-neutral-900">{title}</h2>
          {author && <p className="text-xs text-neutral-500">By {author}</p>}
        </div>
        {showViewAll && (
          <Link to="/" className="flex items-center text-sm font-medium text-purple-600">
            View all <ChevronRightIcon size={16} />
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <Link
            key={item.id}
            to={`/dish/${item.id}`}
            className="flex items-center bg-neutral-50 rounded-lg p-2 hover:bg-neutral-100 transition-colors"
          >
            <div className="mr-3 font-medium text-neutral-400">{index + 1}</div>
            <div className="h-16 w-16 rounded-md overflow-hidden mr-3 shrink-0">
              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-neutral-900 line-clamp-1">{item.name}</h3>
              <p className="text-xs text-neutral-500">{item.restaurant}</p>
            </div>
            <TierBadge tier={item.tier} size="sm" showEmoji={false} />
          </Link>
        ))}
      </div>
    </div>
  )
}
