import type { TierType } from '../data/types'
import { TIER_CONFIG } from '../data/types'

interface TierBadgeProps {
  tier: TierType
  size?: 'sm' | 'md' | 'lg'
  showEmoji?: boolean
}

export function TierBadge({ tier, size = 'md', showEmoji = true }: TierBadgeProps) {
  const config = TIER_CONFIG[tier]

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-lg',
  }

  return (
    <div className="flex items-center">
      <div
        className={`${sizeClasses[size]} flex items-center justify-center rounded-md bg-gradient-to-br ${config.gradient} text-white font-bold shadow-sm`}
      >
        {tier}
      </div>
      {showEmoji && (
        <div className="ml-1.5 flex flex-col text-xs">
          <span className={size === 'lg' ? 'text-base' : 'text-xs'}>
            {config.emoji}
          </span>
          <span className="font-medium text-neutral-600">{config.label}</span>
        </div>
      )}
    </div>
  )
}
