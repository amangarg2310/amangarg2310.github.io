import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUpIcon, MessageSquareIcon, ListIcon, UserPlusIcon } from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import type { TierType } from '../data/types'

function getActivityIcon(type: string) {
  switch (type) {
    case 'rating': return <TrendingUpIcon size={14} className="text-purple-500" />
    case 'review': return <MessageSquareIcon size={14} className="text-blue-500" />
    case 'tier_list': return <ListIcon size={14} className="text-green-500" />
    case 'follow': return <UserPlusIcon size={14} className="text-pink-500" />
    default: return null
  }
}

function getActivityText(type: string, targetName: string, meta: string) {
  const parsed = JSON.parse(meta || '{}')
  switch (type) {
    case 'rating': return <>rated <span className="font-medium">{targetName}</span> {parsed.tier && <TierBadge tier={parsed.tier as TierType} size="sm" showEmoji={false} />}</>
    case 'review': return <>reviewed <span className="font-medium">{targetName}</span></>
    case 'tier_list': return <>created tier list <span className="font-medium">{targetName}</span></>
    case 'follow': return <>started following <span className="font-medium">{targetName}</span></>
    default: return targetName
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ActivityFeedPage() {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: () => api.feed(),
  })

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      <header className="mb-5 animate-fade-in-up">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Activity</h1>
        <p className="text-neutral-500 text-sm">See what your food friends are up to</p>
      </header>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <UserPlusIcon size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium">No activity yet</p>
          <p className="text-sm mt-1">Follow other foodies to see their activity here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((activity, i) => (
            <Link
              key={activity.id}
              to={activity.type === 'follow' ? `/user/${activity.target_id}` : activity.type === 'tier_list' ? '/tier-builder' : `/dish/${activity.target_id}`}
              className={`flex items-center gap-3 bg-white dark:bg-neutral-800 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
            >
              <img src={activity.avatar} alt={activity.username} className="w-10 h-10 rounded-full object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm flex-wrap">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{activity.username}</span>
                  {getActivityIcon(activity.type)}
                  <span className="text-neutral-600 dark:text-neutral-400">{getActivityText(activity.type, activity.target_name, activity.meta)}</span>
                </div>
                <span className="text-xs text-neutral-400">{timeAgo(activity.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
