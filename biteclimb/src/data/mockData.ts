import type { Dish, Restaurant, UserProfile, UserTierList, Review } from './types'

export const dishes: Dish[] = [
  {
    id: '1',
    name: 'Truffle Mushroom Pasta',
    imageUrl: 'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=800&q=80',
    ],
    tier: 'S',
    location: 'SoHo, NYC',
    restaurant: 'Pasta Emilia',
    ratingCount: 128,
    cuisine: 'Italian',
    description: 'Handmade fettuccine with wild mushrooms, black truffle, and a creamy parmesan sauce.',
    price: '$26',
    ratings: { S: 65, A: 42, B: 15, C: 4, D: 2, F: 0 },
    trendingDelta: 12,
    todayRatings: 8,
  },
  {
    id: '2',
    name: 'Spicy Tuna Roll',
    imageUrl: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80',
    ],
    tier: 'A',
    location: 'Midtown, NYC',
    restaurant: 'Sushi Palace',
    ratingCount: 87,
    cuisine: 'Japanese',
    description: 'Fresh spicy tuna with crispy tempura flakes, avocado, and a sriracha drizzle.',
    price: '$18',
    ratings: { S: 20, A: 38, B: 18, C: 7, D: 3, F: 1 },
    trendingDelta: -3,
    todayRatings: 2,
  },
  {
    id: '3',
    name: 'Korean Fried Chicken',
    imageUrl: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=800&q=80',
    ],
    tier: 'S',
    location: 'K-Town, NYC',
    restaurant: 'Seoul Food',
    ratingCount: 203,
    cuisine: 'Korean',
    description: 'Double-fried chicken with a sweet and spicy gochujang glaze, served with pickled radish.',
    price: '$16',
    ratings: { S: 110, A: 55, B: 25, C: 8, D: 4, F: 1 },
    trendingDelta: 24,
    todayRatings: 15,
  },
  {
    id: '4',
    name: 'Tonkotsu Ramen',
    imageUrl: 'https://images.unsplash.com/photo-1614563637806-1d0e645e0940?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1614563637806-1d0e645e0940?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
    ],
    tier: 'S',
    location: 'East Village, NYC',
    restaurant: 'Ippudo',
    ratingCount: 156,
    cuisine: 'Japanese',
    description: 'Rich pork bone broth with chashu, soft-boiled egg, wood ear mushrooms, and thin noodles.',
    price: '$19',
    ratings: { S: 82, A: 45, B: 18, C: 7, D: 3, F: 1 },
    trendingDelta: 5,
    todayRatings: 6,
  },
  {
    id: '5',
    name: 'Birria Tacos',
    imageUrl: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80',
    ],
    tier: 'A',
    location: 'Jackson Heights, NYC',
    restaurant: 'Taqueria La Estrella',
    ratingCount: 94,
    cuisine: 'Mexican',
    description: 'Slow-braised beef birria in crispy tortillas with consommé for dipping.',
    price: '$14',
    ratings: { S: 30, A: 35, B: 18, C: 7, D: 3, F: 1 },
    trendingDelta: 18,
    todayRatings: 11,
  },
  {
    id: '6',
    name: 'Pad Thai',
    imageUrl: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80',
    ],
    tier: 'B',
    location: "Hell's Kitchen, NYC",
    restaurant: 'Thai Diner',
    ratingCount: 62,
    cuisine: 'Thai',
    description: 'Classic stir-fried rice noodles with shrimp, tofu, peanuts, and tamarind sauce.',
    price: '$17',
    ratings: { S: 10, A: 15, B: 22, C: 10, D: 3, F: 2 },
    trendingDelta: -1,
    todayRatings: 1,
  },
  {
    id: '7',
    name: 'Margherita Pizza',
    imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80',
    tier: 'S',
    location: 'Greenwich Village, NYC',
    restaurant: "Joe's Pizza",
    ratingCount: 312,
    cuisine: 'Italian',
    description: 'Classic Neapolitan-style with San Marzano tomatoes, fresh mozzarella, and basil.',
    price: '$4',
    ratings: { S: 180, A: 80, B: 30, C: 15, D: 5, F: 2 },
    trendingDelta: 8,
    todayRatings: 22,
  },
  {
    id: '8',
    name: 'Butter Chicken',
    imageUrl: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80',
    tier: 'A',
    location: 'Curry Hill, NYC',
    restaurant: 'Punjab Deli',
    ratingCount: 78,
    cuisine: 'Indian',
    description: 'Tender chicken in a rich, creamy tomato-based sauce with aromatic spices.',
    price: '$15',
    ratings: { S: 22, A: 30, B: 16, C: 6, D: 3, F: 1 },
    trendingDelta: 6,
    todayRatings: 4,
  },
]

export const reviews: Review[] = [
  {
    id: 'r1',
    dishId: '1',
    userName: 'PastaLover99',
    userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80',
    tier: 'S',
    text: 'The truffle flavor is insane. Best pasta I\'ve had in NYC, hands down. The handmade fettuccine has the perfect bite.',
    date: '2 days ago',
    helpful: 24,
  },
  {
    id: 'r2',
    dishId: '1',
    userName: 'NYCFoodie',
    userAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80',
    tier: 'S',
    text: 'Worth every penny. The mushroom blend is unique and the truffle isn\'t overpowering like most places.',
    date: '5 days ago',
    helpful: 18,
  },
  {
    id: 'r3',
    dishId: '1',
    userName: 'BiteExplorer',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80',
    tier: 'A',
    text: 'Really solid. Would be S-tier if the portion was a bit bigger for the price.',
    date: '1 week ago',
    helpful: 12,
  },
  {
    id: 'r4',
    dishId: '3',
    userName: 'ChickenConnoisseur',
    userAvatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=100&q=80',
    tier: 'S',
    text: 'The double-fry technique makes the skin SO crispy. Gochujang glaze is perfectly balanced.',
    date: '1 day ago',
    helpful: 31,
  },
  {
    id: 'r5',
    dishId: '3',
    userName: 'KTownRegular',
    userAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&q=80',
    tier: 'S',
    text: 'Been eating KFC all over K-Town for years. Seoul Food is the undisputed champion.',
    date: '3 days ago',
    helpful: 19,
  },
  {
    id: 'r6',
    dishId: '4',
    userName: 'RamenHead',
    userAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80',
    tier: 'S',
    text: 'The broth is liquid gold. 18-hour simmer and you can taste every minute of it.',
    date: '4 days ago',
    helpful: 27,
  },
]

export const restaurants: Restaurant[] = [
  {
    id: '1',
    name: "Joe's Pizza",
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    neighborhood: 'Greenwich Village',
    communityTier: 'S',
    ratingCount: 1205,
  },
  {
    id: '2',
    name: "Grimaldi's",
    imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80',
    neighborhood: 'DUMBO',
    communityTier: 'A',
    ratingCount: 983,
  },
  {
    id: '3',
    name: "Lombardi's",
    imageUrl: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=800&q=80',
    neighborhood: 'NoLita',
    communityTier: 'A',
    ratingCount: 756,
  },
  {
    id: '4',
    name: 'Artichoke Basille',
    imageUrl: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=800&q=80',
    neighborhood: 'East Village',
    communityTier: 'B',
    ratingCount: 544,
  },
]

export const userProfile: UserProfile = {
  name: 'FoodieQueen',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
  bio: 'Food explorer and culinary adventurer. Always hunting for the next S-tier dish!',
  stats: {
    tierLists: 12,
    dishesRated: 87,
    followers: 245,
  },
  badges: [
    { name: 'Pizza Pro', icon: '🍕', level: 3, progress: 8, maxProgress: 10 },
    { name: 'Ramen Expert', icon: '🍜', level: 2, progress: 5, maxProgress: 8 },
    { name: 'Burger Boss', icon: '🍔', level: 4, progress: 12, maxProgress: 15 },
    { name: 'Taco Hunter', icon: '🌮', level: 1, progress: 3, maxProgress: 5 },
  ],
  tasteDNA: {
    Italian: 28,
    Japanese: 22,
    Korean: 18,
    Mexican: 14,
    Thai: 10,
    Indian: 8,
  },
  streak: {
    current: 5,
    best: 12,
  },
  joinedDate: 'March 2025',
  foodPersonality: 'Spice Seeker',
}

export const userTierLists: UserTierList[] = [
  {
    id: '1',
    title: 'Best Ramen in NYC',
    imageUrl: 'https://images.unsplash.com/photo-1614563637806-1d0e645e0940?auto=format&fit=crop&w=800&q=80',
    count: 5,
  },
  {
    id: '2',
    title: "NYC's Top Burgers",
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    count: 8,
  },
]

export const cuisineTypes = [
  'All', 'Italian', 'Japanese', 'Korean', 'Chinese',
  'Mexican', 'American', 'Thai', 'Indian', 'Mediterranean',
]

export function getDishById(id: string): Dish | undefined {
  return dishes.find((d) => d.id === id)
}

export function getReviewsForDish(dishId: string): Review[] {
  return reviews.filter((r) => r.dishId === dishId)
}

export function getSimilarDishes(dish: Dish): Dish[] {
  return dishes
    .filter((d) => d.id !== dish.id && (d.cuisine === dish.cuisine || d.tier === dish.tier))
    .slice(0, 4)
}

export function getTrendingDishes(): Dish[] {
  return [...dishes]
    .filter((d) => (d.trendingDelta ?? 0) > 0)
    .sort((a, b) => (b.trendingDelta ?? 0) - (a.trendingDelta ?? 0))
    .slice(0, 5)
}

export function getTopRatedDishes(): Dish[] {
  return dishes
    .filter((d) => d.tier === 'S')
    .sort((a, b) => b.ratingCount - a.ratingCount)
    .slice(0, 5)
}
