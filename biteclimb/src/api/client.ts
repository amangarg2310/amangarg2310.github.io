const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('biteclimb_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// Auth
export const api = {
  auth: {
    signup: (data: { email: string; username: string; password: string }) =>
      request<{ token: string; user: UserData }>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: UserData }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<UserMeData>('/auth/me'),
    updateProfile: (data: Record<string, unknown>) =>
      request<{ success: boolean }>('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),
  },

  products: {
    list: (params?: { category?: string; search?: string; sort?: string }) => {
      const qs = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, String(v)) })
      }
      return request<ProductData[]>(`/products?${qs}`)
    },
    get: (id: string) => request<ProductDetailData>(`/products/${id}`),
    rate: (id: string, tier: string) =>
      request<{ success: boolean; community_tier: string }>(`/products/${id}/rate`, { method: 'POST', body: JSON.stringify({ tier }) }),
    toggleFavorite: (id: string) =>
      request<{ is_favorite: boolean }>(`/products/${id}/favorite`, { method: 'POST' }),
    addReview: (id: string, data: { tier: string; text: string }) =>
      request<{ id: string }>(`/products/${id}/reviews`, { method: 'POST', body: JSON.stringify(data) }),
    markHelpful: (reviewId: string) =>
      request<{ marked: boolean }>(`/products/reviews/${reviewId}/helpful`, { method: 'POST' }),
    getLabels: (id: string) =>
      request<ProductLabelsData>(`/products/${id}/labels`),
    toggleLabel: (id: string, label: string) =>
      request<{ added: boolean; label: string }>(`/products/${id}/labels`, { method: 'POST', body: JSON.stringify({ label }) }),
    topByCategory: (category?: string) => {
      const qs = category && category !== 'All' ? `?category=${encodeURIComponent(category)}` : ''
      return request<ProductRankingData[]>(`/products/top-by-category${qs}`)
    },
    getMatchup: (categoryId: string) =>
      request<MatchupData>(`/products/matchup?category=${encodeURIComponent(categoryId)}`),
    submitMatchup: (data: { product_a_id: string; product_b_id: string; winner_id: string | null; category: string }) =>
      request<{ success: boolean; product_a_elo: number | null; product_b_elo: number | null }>('/products/matchup', { method: 'POST', body: JSON.stringify(data) }),
    eloRankings: (category: string) =>
      request<EloRankingProduct[]>(`/products/elo-rankings?category=${encodeURIComponent(category)}`),
    markTried: (id: string, data: { photo_url?: string; notes?: string }) =>
      request<{ id: string; try_count: number }>(`/products/${id}/try`, { method: 'POST', body: JSON.stringify(data) }),
    create: (data: { name: string; brand_id: string; category_id?: string; price_range?: string; size?: string; description?: string; image_url?: string; barcode?: string }) =>
      request<{ id: string; name: string }>('/products', { method: 'POST', body: JSON.stringify(data) }),
  },

  brands: {
    list: () => request<BrandData[]>('/brands'),
    get: (id: string) => request<BrandDetailData>(`/brands/${id}`),
    topByCategory: (category?: string) => {
      const qs = category ? `?category=${encodeURIComponent(category)}` : ''
      return request<Record<string, CategoryRankedBrand[]>>(`/brands/top-by-category${qs}`)
    },
    trending: () => request<TrendingBrandData[]>('/brands/trending'),
    create: (data: { name: string; category?: string; image_url?: string }) =>
      request<{ id: string; name: string }>('/brands', { method: 'POST', body: JSON.stringify(data) }),
  },

  categories: {
    list: () => request<CategoryData[]>('/categories'),
    get: (id: string) => request<CategoryData>(`/categories/${id}`),
  },

  tierLists: {
    list: (userId?: string) => {
      const qs = userId ? `?user_id=${userId}` : ''
      return request<TierListData[]>(`/tier-lists${qs}`)
    },
    get: (id: string) => request<TierListDetailData>(`/tier-lists/${id}`),
    create: (data: { title: string; category?: string; items?: { product_id?: string; tier: string; sort_order?: number }[] }) =>
      request<{ id: string }>('/tier-lists', { method: 'POST', body: JSON.stringify(data) }),
    autoGenerate: (category?: string) => {
      const qs = category ? `?category=${encodeURIComponent(category)}` : ''
      return request<{ tier: string; product_id: string; name: string; image_url: string; brand_name: string; price_range: string }[]>(`/tier-lists/auto-generate${qs}`)
    },
    update: (id: string, data: Record<string, unknown>) =>
      request<{ success: boolean }>(`/tier-lists/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/tier-lists/${id}`, { method: 'DELETE' }),
  },

  users: {
    profile: (id: string) => request<UserProfileData>(`/users/${id}/profile`),
    toggleFollow: (id: string) =>
      request<{ is_following: boolean }>(`/users/${id}/follow`, { method: 'POST' }),
    activity: (id: string) => request<ActivityData[]>(`/users/${id}/activity`),
  },

  tries: {
    mine: (params?: { limit?: number; offset?: number }) => {
      const qs = new URLSearchParams()
      if (params?.limit) qs.set('limit', String(params.limit))
      if (params?.offset) qs.set('offset', String(params.offset))
      return request<TryData[]>(`/tries/me?${qs}`)
    },
  },

  feed: () => request<ActivityData[]>('/feed'),
}

// Types
export interface UserData {
  id: string
  email: string
  username: string
  avatar: string
  bio: string
  product_personality: string
}

export interface UserMeData extends UserData {
  created_at: string
  products_rated: number
  tier_lists: number
  followers: number
  following: number
  category_prefs: string[]
  taste_dna: { category: string; count: number }[]
  favorites: string[]
  streak: number
  try_count: number
}

export interface ProductLabelCount {
  label: string
  count: number
}

export interface ProductData {
  id: string
  name: string
  image_url: string
  images: string[]
  tier: string
  brand: string
  brand_id: string
  category_id: string
  category: string
  rating_count: number
  description: string
  price_range: string
  size: string
  ratings: Record<string, number>
  trending_delta: number
  today_ratings: number
  user_rating: string | null
  is_favorite: boolean
  seed_tier: string | null
  friends_rated_count: number
  labels?: ProductLabelCount[]
}

export interface ProductDetailData extends ProductData {
  reviews: ReviewData[]
  similar: SimilarProductData[]
  user_labels?: string[]
  elo_score?: number | null
  matches_played?: number
  category_elo_rank?: number | null
  category_elo_total?: number | null
  try_count: number
  user_try_count: number
}

export interface ProductLabelsData {
  labels: ProductLabelCount[]
  user_labels: string[]
  valid_labels: string[]
}

export interface ReviewData {
  id: string
  tier: string
  text: string
  created_at: string
  user_id: string
  username: string
  avatar: string
  helpful: number
}

export interface SimilarProductData {
  id: string
  name: string
  image_url: string
  category: string
  brand: string
  brand_name: string
  rating_count: number
  tier: string
}

export interface BrandData {
  id: string
  name: string
  image_url: string
  category: string
  community_tier: string
  rating_count: number
}

export interface BrandDetailData extends BrandData {
  products: {
    id: string
    name: string
    image_url: string
    category: string
    price_range: string
    rating_count: number
    tier: string
    labels: ProductLabelCount[]
    bayesian_score: number
    observed_score: number
    worth_it_pct: number
    elo_score?: number
    matches_played?: number
  }[]
}

export interface TrendingBrandData {
  id: string
  name: string
  image_url: string
  category: string
  community_tier: string
  velocity: number
  week_ratings: number
  top_product: {
    id: string
    name: string
    image_url: string
    tier: string
    labels: ProductLabelCount[]
  } | null
}

export interface ProductRankingData {
  id: string
  name: string
  image_url: string
  brand_id: string
  brand_name: string
  category: string
  price_range: string
  tier: string
  labels: ProductLabelCount[]
  bayesian_score: number
  observed_score: number
  composite_score: number
  rating_count: number
  elo_score: number
  matches_played: number
  category_rank: number
  worth_it_pct: number
}

export interface MatchupProduct {
  id: string
  name: string
  image_url: string
  brand_name: string
  price_range: string
  tier: string
  elo_score: number
  matches_played: number
}

export interface MatchupData {
  product_a: MatchupProduct
  product_b: MatchupProduct
}

export interface EloRankingProduct {
  category_rank: number
  product_id: string
  name: string
  image_url: string
  brand_name: string
  price_range: string
  tier: string
  elo_score: number
  matches_played: number
}

export interface CategoryData {
  id: string
  name: string
  slug: string
  emoji: string
  product_count: number
}

export interface TierListData {
  id: string
  user_id: string
  title: string
  category: string
  is_public: number
  created_at: string
  updated_at: string
  username: string
  avatar: string
  item_count: number
}

export interface TierListDetailData extends TierListData {
  items: TierListItemData[]
}

export interface TierListItemData {
  tier: string
  sort_order: number
  product_id?: string
  name: string
  image_url: string
  brand_name?: string
  price_range?: string
}

export interface TryData {
  id: string
  product_id: string
  brand_id: string
  photo_url: string
  notes: string
  created_at: string
  product_name: string
  product_image: string
  category: string
  brand_name: string
  tier: string | null
}

export interface UserProfileData {
  id: string
  username: string
  avatar: string
  bio: string
  product_personality: string
  created_at: string
  products_rated: number
  tier_lists: number
  followers: number
  following: number
  is_following: boolean
  taste_dna: { category: string; count: number }[]
  recent_ratings: { tier: string; created_at: string; product_id: string; name: string; image_url: string; brand_name: string }[]
  tier_lists_list?: TierListData[]
  streak?: number
}

export interface ActivityData {
  id: string
  user_id: string
  type: string
  target_id: string
  target_name: string
  meta: string
  created_at: string
  username: string
  avatar: string
}

export interface CategoryRankedBrand {
  id: string
  name: string
  image_url: string
  category: string
  community_tier: string
  bayesian_score: number
  observed_score: number
  rating_count: number
  recent_ratings: number
  velocity: number
  top_products: {
    id: string
    name: string
    image_url: string
    price_range: string
    product_rating_count: number
    tier: string
    labels: ProductLabelCount[]
  }[]
  is_newcomer: boolean
  rank: number
}
