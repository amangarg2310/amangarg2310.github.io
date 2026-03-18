export type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TierConfig {
  gradient: string;
  bgGradient: string;
  emoji: string;
  label: string;
  color: string;
}

export const TIER_CONFIG: Record<TierType, TierConfig> = {
  S: { gradient: 'from-purple-500 to-pink-500', bgGradient: 'from-purple-50 to-pink-50', emoji: '🔥', label: 'God Tier', color: 'text-purple-600' },
  A: { gradient: 'from-blue-500 to-indigo-500', bgGradient: 'from-blue-50 to-indigo-50', emoji: '🤤', label: 'Amazing', color: 'text-blue-600' },
  B: { gradient: 'from-teal-500 to-green-500', bgGradient: 'from-teal-50 to-green-50', emoji: '😋', label: 'Good', color: 'text-teal-600' },
  C: { gradient: 'from-yellow-500 to-orange-400', bgGradient: 'from-yellow-50 to-orange-50', emoji: '😐', label: 'Decent', color: 'text-yellow-600' },
  D: { gradient: 'from-orange-500 to-red-400', bgGradient: 'from-orange-50 to-red-50', emoji: '😕', label: 'Skip It', color: 'text-orange-600' },
  F: { gradient: 'from-red-500 to-red-700', bgGradient: 'from-red-50 to-red-100', emoji: '🤢', label: 'Awful', color: 'text-red-600' },
};

export const TIER_OPTIONS: TierType[] = ['S', 'A', 'B', 'C', 'D', 'F'];

export interface Product {
  id: string;
  name: string;
  imageUrl: string;
  images?: string[];
  tier: TierType;
  brand: string;
  brandId: string;
  categoryId: string;
  category: string;
  ratingCount: number;
  description?: string;
  priceRange?: string;
  size?: string;
  ratings?: Record<TierType, number>;
  trendingDelta?: number;
  todayRatings?: number;
  seedTier?: string | null;
  friendsRatedCount?: number;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl: string;
  communityTier: TierType;
  ratingCount: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  productCount?: number;
}

export interface UserProfile {
  name: string;
  avatar: string;
  bio: string;
  stats: {
    tierLists: number;
    productsRated: number;
    followers: number;
  };
  tasteDNA: Record<string, number>;
  streak: { current: number; best: number };
  joinedDate: string;
  productPersonality: string;
}

export interface UserTierList {
  id: string;
  title: string;
  imageUrl: string;
  count: number;
}

export interface Review {
  id: string;
  productId: string;
  userName: string;
  userAvatar: string;
  tier: TierType;
  text: string;
  date: string;
  helpful: number;
}
