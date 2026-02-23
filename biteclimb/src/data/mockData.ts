import type { Dish, Restaurant, UserProfile, UserTierList } from './types'

export const dishes: Dish[] = [
  {
    id: '1',
    name: 'Truffle Mushroom Pasta',
    imageUrl: 'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&w=800&q=80',
    tier: 'S',
    location: 'SoHo, NYC',
    restaurant: 'Pasta Emilia',
    ratingCount: 128,
    cuisine: 'Italian',
    description: 'Handmade fettuccine with wild mushrooms, black truffle, and a creamy parmesan sauce.',
    price: '$26',
    ratings: { S: 65, A: 42, B: 15, C: 4, D: 2, F: 0 },
  },
  {
    id: '2',
    name: 'Spicy Tuna Roll',
    imageUrl: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80',
    tier: 'A',
    location: 'Midtown, NYC',
    restaurant: 'Sushi Palace',
    ratingCount: 87,
    cuisine: 'Japanese',
    description: 'Fresh spicy tuna with crispy tempura flakes, avocado, and a sriracha drizzle.',
    price: '$18',
    ratings: { S: 20, A: 38, B: 18, C: 7, D: 3, F: 1 },
  },
  {
    id: '3',
    name: 'Korean Fried Chicken',
    imageUrl: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80',
    tier: 'S',
    location: 'K-Town, NYC',
    restaurant: 'Seoul Food',
    ratingCount: 203,
    cuisine: 'Korean',
    description: 'Double-fried chicken with a sweet and spicy gochujang glaze, served with pickled radish.',
    price: '$16',
    ratings: { S: 110, A: 55, B: 25, C: 8, D: 4, F: 1 },
  },
  {
    id: '4',
    name: 'Tonkotsu Ramen',
    imageUrl: 'https://images.unsplash.com/photo-1614563637806-1d0e645e0940?auto=format&fit=crop&w=800&q=80',
    tier: 'S',
    location: 'East Village, NYC',
    restaurant: 'Ippudo',
    ratingCount: 156,
    cuisine: 'Japanese',
    description: 'Rich pork bone broth with chashu, soft-boiled egg, wood ear mushrooms, and thin noodles.',
    price: '$19',
    ratings: { S: 82, A: 45, B: 18, C: 7, D: 3, F: 1 },
  },
  {
    id: '5',
    name: 'Birria Tacos',
    imageUrl: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80',
    tier: 'A',
    location: 'Jackson Heights, NYC',
    restaurant: 'Taqueria La Estrella',
    ratingCount: 94,
    cuisine: 'Mexican',
    description: 'Slow-braised beef birria in crispy tortillas with consommé for dipping.',
    price: '$14',
    ratings: { S: 30, A: 35, B: 18, C: 7, D: 3, F: 1 },
  },
  {
    id: '6',
    name: 'Pad Thai',
    imageUrl: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80',
    tier: 'B',
    location: 'Hell\'s Kitchen, NYC',
    restaurant: 'Thai Diner',
    ratingCount: 62,
    cuisine: 'Thai',
    description: 'Classic stir-fried rice noodles with shrimp, tofu, peanuts, and tamarind sauce.',
    price: '$17',
    ratings: { S: 10, A: 15, B: 22, C: 10, D: 3, F: 2 },
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
    { name: 'Pizza Pro', icon: '🍕', level: 3 },
    { name: 'Ramen Expert', icon: '🍜', level: 2 },
    { name: 'Burger Boss', icon: '🍔', level: 4 },
  ],
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
