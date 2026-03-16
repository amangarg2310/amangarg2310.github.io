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

  dishes: {
    list: (params?: { cuisine?: string; search?: string; sort?: string; lat?: number; lng?: number; radius?: number }) => {
      const qs = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, String(v)) })
      }
      return request<DishData[]>(`/dishes?${qs}`)
    },
    get: (id: string) => request<DishDetailData>(`/dishes/${id}`),
    rate: (id: string, tier: string) =>
      request<{ success: boolean; community_tier: string }>(`/dishes/${id}/rate`, { method: 'POST', body: JSON.stringify({ tier }) }),
    toggleFavorite: (id: string) =>
      request<{ is_favorite: boolean }>(`/dishes/${id}/favorite`, { method: 'POST' }),
    addReview: (id: string, data: { tier: string; text: string }) =>
      request<{ id: string }>(`/dishes/${id}/reviews`, { method: 'POST', body: JSON.stringify(data) }),
    markHelpful: (reviewId: string) =>
      request<{ marked: boolean }>(`/dishes/reviews/${reviewId}/helpful`, { method: 'POST' }),
    getLabels: (id: string) =>
      request<DishLabelsData>(`/dishes/${id}/labels`),
    toggleLabel: (id: string, label: string) =>
      request<{ added: boolean; label: string }>(`/dishes/${id}/labels`, { method: 'POST', body: JSON.stringify({ label }) }),
    topByCuisine: (cuisine?: string) => {
      const qs = cuisine && cuisine !== 'All' ? `?cuisine=${encodeURIComponent(cuisine)}` : ''
      return request<DishRankingData[]>(`/dishes/top-by-cuisine${qs}`)
    },
    getMatchup: (cuisine: string) =>
      request<MatchupData>(`/dishes/matchup?cuisine=${encodeURIComponent(cuisine)}`),
    submitMatchup: (data: { dish_a_id: string; dish_b_id: string; winner_id: string | null; cuisine: string }) =>
      request<{ success: boolean; dish_a_elo: number | null; dish_b_elo: number | null }>('/dishes/matchup', { method: 'POST', body: JSON.stringify(data) }),
    eloRankings: (cuisine: string) =>
      request<EloRankingDish[]>(`/dishes/elo-rankings?cuisine=${encodeURIComponent(cuisine)}`),
    checkin: (id: string, data: { photo_url?: string; notes?: string }) =>
      request<{ id: string; checkin_count: number }>(`/dishes/${id}/checkin`, { method: 'POST', body: JSON.stringify(data) }),
    create: (data: { name: string; restaurant_id: string; cuisine?: string; price?: string; description?: string; image_url?: string }) =>
      request<{ id: string; name: string }>('/dishes', { method: 'POST', body: JSON.stringify(data) }),
  },

  restaurants: {
    list: () => request<RestaurantData[]>('/restaurants'),
    get: (id: string) => request<RestaurantDetailData>(`/restaurants/${id}`),
    topByCuisine: (cuisine?: string) => {
      const qs = cuisine ? `?cuisine=${encodeURIComponent(cuisine)}` : ''
      return request<Record<string, CuisineRankedRestaurant[]>>(`/restaurants/top-by-cuisine${qs}`)
    },
    challengers: () => request<ChallengerData[]>('/restaurants/challengers'),
    rising: () => request<RisingRestaurantData[]>('/restaurants/rising'),
    create: (data: { name: string; cuisine: string; neighborhood?: string; lat?: number; lng?: number; image_url?: string }) =>
      request<{ id: string; name: string }>('/restaurants', { method: 'POST', body: JSON.stringify(data) }),
  },

  tierLists: {
    list: (userId?: string) => {
      const qs = userId ? `?user_id=${userId}` : ''
      return request<TierListData[]>(`/tier-lists${qs}`)
    },
    get: (id: string) => request<TierListDetailData>(`/tier-lists/${id}`),
    create: (data: { title: string; category?: string; city?: string; items?: { dish_id?: string; restaurant_id?: string; tier: string; sort_order?: number }[] }) =>
      request<{ id: string }>('/tier-lists', { method: 'POST', body: JSON.stringify(data) }),
    autoGenerate: (cuisine?: string) => {
      const qs = cuisine ? `?cuisine=${encodeURIComponent(cuisine)}` : ''
      return request<{ tier: string; dish_id: string; name: string; image_url: string; restaurant_name: string; price: string }[]>(`/tier-lists/auto-generate${qs}`)
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

  checkins: {
    mine: (params?: { limit?: number; offset?: number }) => {
      const qs = new URLSearchParams()
      if (params?.limit) qs.set('limit', String(params.limit))
      if (params?.offset) qs.set('offset', String(params.offset))
      return request<CheckinData[]>(`/checkins/me?${qs}`)
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
  food_personality: string
}

export interface UserMeData extends UserData {
  created_at: string
  dishes_rated: number
  tier_lists: number
  followers: number
  following: number
  cuisine_prefs: string[]
  taste_dna: { cuisine: string; count: number }[]
  favorites: string[]
  streak: number
  checkin_count: number
}

export interface DishLabelCount {
  label: string
  count: number
}

export interface DishData {
  id: string
  name: string
  image_url: string
  images: string[]
  tier: string
  location: string
  restaurant: string
  restaurant_id: string
  rating_count: number
  cuisine: string
  description: string
  price: string
  ratings: Record<string, number>
  trending_delta: number
  today_ratings: number
  user_rating: string | null
  is_favorite: boolean
  distance: number | null
  lat: number
  lng: number
  labels?: DishLabelCount[]
}

export interface DishDetailData extends DishData {
  reviews: ReviewData[]
  similar: SimilarDishData[]
  user_labels?: string[]
  elo_score?: number | null
  matches_played?: number
  cuisine_elo_rank?: number | null
  cuisine_elo_total?: number | null
  checkin_count: number
  user_checkin_count: number
}

export interface DishLabelsData {
  labels: DishLabelCount[]
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

export interface SimilarDishData {
  id: string
  name: string
  image_url: string
  location: string
  cuisine: string
  restaurant: string
  restaurant_name: string
  rating_count: number
  tier: string
}

export interface RestaurantData {
  id: string
  name: string
  image_url: string
  neighborhood: string
  cuisine: string
  community_tier: string
  rating_count: number
  lat: number
  lng: number
}

export interface RestaurantDetailData extends RestaurantData {
  dishes: {
    id: string
    name: string
    image_url: string
    cuisine: string
    price: string
    location: string
    rating_count: number
    tier: string
    labels: DishLabelCount[]
    bayesian_score: number
    observed_score: number
    worth_it_pct: number
    elo_score?: number
    matches_played?: number
  }[]
}

export interface RisingRestaurantData {
  id: string
  name: string
  image_url: string
  cuisine: string
  community_tier: string
  velocity: number
  week_ratings: number
  top_dish: {
    id: string
    name: string
    image_url: string
    tier: string
    labels: DishLabelCount[]
  } | null
}

export interface DishRankingData {
  id: string
  name: string
  image_url: string
  restaurant_id: string
  restaurant_name: string
  cuisine: string
  price: string
  tier: string
  labels: DishLabelCount[]
  bayesian_score: number
  observed_score: number
  composite_score: number
  rating_count: number
  elo_score: number
  matches_played: number
  cuisine_rank: number
  worth_it_pct: number
}

export interface MatchupDish {
  id: string
  name: string
  image_url: string
  restaurant_name: string
  price: string
  tier: string
  elo_score: number
  matches_played: number
}

export interface MatchupData {
  dish_a: MatchupDish
  dish_b: MatchupDish
}

export interface EloRankingDish {
  cuisine_rank: number
  dish_id: string
  name: string
  image_url: string
  restaurant_name: string
  price: string
  tier: string
  elo_score: number
  matches_played: number
}

export interface TierListData {
  id: string
  user_id: string
  title: string
  category: string
  city: string
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
  dish_id?: string
  restaurant_id?: string
  name: string
  image_url: string
  neighborhood?: string
  restaurant_name?: string
  price?: string
}

export interface CheckinData {
  id: string
  dish_id: string
  restaurant_id: string
  photo_url: string
  notes: string
  created_at: string
  dish_name: string
  dish_image: string
  cuisine: string
  restaurant_name: string
  tier: string | null
}

export interface UserProfileData {
  id: string
  username: string
  avatar: string
  bio: string
  food_personality: string
  created_at: string
  dishes_rated: number
  tier_lists: number
  followers: number
  following: number
  is_following: boolean
  taste_dna: { cuisine: string; count: number }[]
  recent_ratings: { tier: string; created_at: string; dish_id: string; name: string; image_url: string; restaurant_name: string }[]
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

export interface CuisineRankedRestaurant {
  id: string
  name: string
  image_url: string
  neighborhood: string
  cuisine: string
  community_tier: string
  bayesian_score: number
  observed_score: number
  rating_count: number
  recent_ratings: number
  velocity: number
  top_dishes: {
    id: string
    name: string
    image_url: string
    price: string
    dish_rating_count: number
    tier: string
    labels: DishLabelCount[]
  }[]
  is_newcomer: boolean
  rank: number
  // Legacy compat fields (may be present in old responses)
  score?: number
  confidence?: number
  momentum?: number
}

export interface ChallengerData {
  cuisine: string
  newcomer: {
    id: string
    name: string
    image_url: string
    neighborhood: string
    cuisine: string
    score: number
    rating_count: number
    week_ratings: number
    community_tier: string
    best_dish: { id: string; name: string; image_url: string } | null
  }
  incumbent: {
    id: string
    name: string
    score: number
    rating_count: number
    community_tier: string
    best_dish: { id: string; name: string; image_url: string } | null
  }
  reason: string
}
