export type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export interface TierConfig {
  gradient: string
  emoji: string
  label: string
}

export const TIER_CONFIG: Record<TierType, TierConfig> = {
  S: { gradient: 'from-purple-500 to-pink-500', emoji: '🔥', label: 'God Tier' },
  A: { gradient: 'from-blue-500 to-indigo-500', emoji: '🤤', label: 'Amazing' },
  B: { gradient: 'from-teal-500 to-green-500', emoji: '😋', label: 'Good' },
  C: { gradient: 'from-yellow-500 to-orange-400', emoji: '😐', label: 'Decent' },
  D: { gradient: 'from-orange-500 to-red-400', emoji: '😕', label: 'Skip It' },
  F: { gradient: 'from-red-500 to-red-700', emoji: '🤢', label: 'Awful' },
}

export const TIER_OPTIONS: TierType[] = ['S', 'A', 'B', 'C', 'D', 'F']

export interface Dish {
  id: string
  name: string
  imageUrl: string
  tier: TierType
  location: string
  restaurant: string
  ratingCount: number
  cuisine: string
  description?: string
  price?: string
  ratings?: Record<TierType, number>
}

export interface Restaurant {
  id: string
  name: string
  imageUrl: string
  neighborhood: string
  communityTier: TierType
  ratingCount: number
}

export interface UserProfile {
  name: string
  avatar: string
  bio: string
  stats: {
    tierLists: number
    dishesRated: number
    followers: number
  }
  badges: Array<{
    name: string
    icon: string
    level: number
  }>
}

export interface UserTierList {
  id: string
  title: string
  imageUrl: string
  count: number
}
