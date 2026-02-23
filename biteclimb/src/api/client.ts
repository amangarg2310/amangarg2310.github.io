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
  },

  restaurants: {
    list: () => request<RestaurantData[]>('/restaurants'),
    get: (id: string) => request<RestaurantDetailData>(`/restaurants/${id}`),
  },

  tierLists: {
    list: (userId?: string) => {
      const qs = userId ? `?user_id=${userId}` : ''
      return request<TierListData[]>(`/tier-lists${qs}`)
    },
    get: (id: string) => request<TierListDetailData>(`/tier-lists/${id}`),
    create: (data: { title: string; category?: string; city?: string; items?: { restaurant_id: string; tier: string; sort_order?: number }[] }) =>
      request<{ id: string }>('/tier-lists', { method: 'POST', body: JSON.stringify(data) }),
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
}

export interface DishDetailData extends DishData {
  reviews: ReviewData[]
  similar: SimilarDishData[]
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
  dishes: { id: string; name: string; image_url: string; cuisine: string; price: string; location: string; rating_count: number }[]
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
  items: { tier: string; sort_order: number; restaurant_id: string; name: string; image_url: string; neighborhood: string }[]
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
