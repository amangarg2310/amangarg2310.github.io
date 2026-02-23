import db from './db.js'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

// Check if already seeded
const existing = db.prepare('SELECT COUNT(*) as count FROM restaurants').get() as { count: number }
if (existing.count > 0) {
  console.log('Database already seeded, skipping.')
  process.exit(0)
}

console.log('Seeding database...')

// ---- Users ----
const demoPassword = bcrypt.hashSync('demo1234', 10)

const users = [
  { id: 'u1', email: 'foodie@biteclimb.com', username: 'FoodieQueen', password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80', bio: 'Food explorer and culinary adventurer. Always hunting for the next S-tier dish!', food_personality: 'Spice Seeker' },
  { id: 'u2', email: 'pastalover@biteclimb.com', username: 'PastaLover99', password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80', bio: 'Carbs are life.', food_personality: 'Comfort Craver' },
  { id: 'u3', email: 'nycfoodie@biteclimb.com', username: 'NYCFoodie', password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80', bio: 'Eating my way through NYC, one borough at a time.', food_personality: 'Urban Explorer' },
  { id: 'u4', email: 'biteexplorer@biteclimb.com', username: 'BiteExplorer', password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80', bio: 'Discovering hidden gems.', food_personality: 'Adventurous Eater' },
  { id: 'u5', email: 'chickenfan@biteclimb.com', username: 'ChickenConnoisseur', password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=100&q=80', bio: 'If it clucks, I rate it.', food_personality: 'Protein Hunter' },
  { id: 'u6', email: 'ktown@biteclimb.com', username: 'KTownRegular', password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&q=80', bio: 'K-Town local.', food_personality: 'Spice Seeker' },
  { id: 'u7', email: 'ramenhead@biteclimb.com', username: 'RamenHead', password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80', bio: 'Broth connoisseur.', food_personality: 'Umami Chaser' },
]

const insertUser = db.prepare('INSERT INTO users (id, email, username, password_hash, avatar, bio, food_personality) VALUES (?, ?, ?, ?, ?, ?, ?)')
for (const u of users) {
  insertUser.run(u.id, u.email, u.username, u.password_hash, u.avatar, u.bio, u.food_personality)
}

// ---- Restaurants ----
// NYC coordinates: 40.7128, -74.0060
const restaurants = [
  { id: 'r1', name: 'Pasta Emilia', image_url: 'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&w=800&q=80', neighborhood: 'SoHo', lat: 40.7233, lng: -73.9987, cuisine: 'Italian' },
  { id: 'r2', name: 'Sushi Palace', image_url: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80', neighborhood: 'Midtown', lat: 40.7549, lng: -73.9840, cuisine: 'Japanese' },
  { id: 'r3', name: 'Seoul Food', image_url: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80', neighborhood: 'K-Town', lat: 40.7475, lng: -73.9868, cuisine: 'Korean' },
  { id: 'r4', name: 'Ippudo', image_url: 'https://images.unsplash.com/photo-1614563637806-1d0e645e0940?auto=format&fit=crop&w=800&q=80', neighborhood: 'East Village', lat: 40.7308, lng: -73.9894, cuisine: 'Japanese' },
  { id: 'r5', name: 'Taqueria La Estrella', image_url: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80', neighborhood: 'Jackson Heights', lat: 40.7496, lng: -73.8783, cuisine: 'Mexican' },
  { id: 'r6', name: 'Thai Diner', image_url: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80', neighborhood: "Hell's Kitchen", lat: 40.7638, lng: -73.9918, cuisine: 'Thai' },
  { id: 'r7', name: "Joe's Pizza", image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80', neighborhood: 'Greenwich Village', lat: 40.7306, lng: -74.0021, cuisine: 'Italian' },
  { id: 'r8', name: 'Punjab Deli', image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80', neighborhood: 'Curry Hill', lat: 40.7449, lng: -73.9826, cuisine: 'Indian' },
  { id: 'r9', name: "Grimaldi's", image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80', neighborhood: 'DUMBO', lat: 40.7026, lng: -73.9934, cuisine: 'Italian' },
  { id: 'r10', name: "Lombardi's", image_url: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=800&q=80', neighborhood: 'NoLita', lat: 40.7216, lng: -73.9956, cuisine: 'Italian' },
  { id: 'r11', name: 'Artichoke Basille', image_url: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=800&q=80', neighborhood: 'East Village', lat: 40.7295, lng: -73.9875, cuisine: 'Italian' },
]

const insertRestaurant = db.prepare('INSERT INTO restaurants (id, name, image_url, neighborhood, lat, lng, cuisine) VALUES (?, ?, ?, ?, ?, ?, ?)')
const insertRestaurantFts = db.prepare('INSERT INTO restaurants_fts (rowid, name, neighborhood, cuisine) VALUES (?, ?, ?, ?)')
for (let i = 0; i < restaurants.length; i++) {
  const r = restaurants[i]
  insertRestaurant.run(r.id, r.name, r.image_url, r.neighborhood, r.lat, r.lng, r.cuisine)
  insertRestaurantFts.run(i + 1, r.name, r.neighborhood, r.cuisine)
}

// ---- Dishes ----
const dishes = [
  { id: 'd1', name: 'Truffle Mushroom Pasta', image_url: 'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r1', location: 'SoHo, NYC', cuisine: 'Italian', description: 'Handmade fettuccine with wild mushrooms, black truffle, and a creamy parmesan sauce.', price: '$26', lat: 40.7233, lng: -73.9987 },
  { id: 'd2', name: 'Spicy Tuna Roll', image_url: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r2', location: 'Midtown, NYC', cuisine: 'Japanese', description: 'Fresh spicy tuna with crispy tempura flakes, avocado, and a sriracha drizzle.', price: '$18', lat: 40.7549, lng: -73.9840 },
  { id: 'd3', name: 'Korean Fried Chicken', image_url: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r3', location: 'K-Town, NYC', cuisine: 'Korean', description: 'Double-fried chicken with a sweet and spicy gochujang glaze, served with pickled radish.', price: '$16', lat: 40.7475, lng: -73.9868 },
  { id: 'd4', name: 'Tonkotsu Ramen', image_url: 'https://images.unsplash.com/photo-1614563637806-1d0e645e0940?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r4', location: 'East Village, NYC', cuisine: 'Japanese', description: 'Rich pork bone broth with chashu, soft-boiled egg, wood ear mushrooms, and thin noodles.', price: '$19', lat: 40.7308, lng: -73.9894 },
  { id: 'd5', name: 'Birria Tacos', image_url: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r5', location: 'Jackson Heights, NYC', cuisine: 'Mexican', description: 'Slow-braised beef birria in crispy tortillas with consommé for dipping.', price: '$14', lat: 40.7496, lng: -73.8783 },
  { id: 'd6', name: 'Pad Thai', image_url: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r6', location: "Hell's Kitchen, NYC", cuisine: 'Thai', description: 'Classic stir-fried rice noodles with shrimp, tofu, peanuts, and tamarind sauce.', price: '$17', lat: 40.7638, lng: -73.9918 },
  { id: 'd7', name: 'Margherita Pizza', image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r7', location: 'Greenwich Village, NYC', cuisine: 'Italian', description: 'Classic Neapolitan-style with San Marzano tomatoes, fresh mozzarella, and basil.', price: '$4', lat: 40.7306, lng: -74.0021 },
  { id: 'd8', name: 'Butter Chicken', image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r8', location: 'Curry Hill, NYC', cuisine: 'Indian', description: 'Tender chicken in a rich, creamy tomato-based sauce with aromatic spices.', price: '$15', lat: 40.7449, lng: -73.9826 },
]

const insertDish = db.prepare('INSERT INTO dishes (id, name, image_url, restaurant_id, location, cuisine, description, price, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
const insertDishFts = db.prepare('INSERT INTO dishes_fts (rowid, name, cuisine, description, location, restaurant_name) VALUES (?, ?, ?, ?, ?, ?)')
for (let i = 0; i < dishes.length; i++) {
  const d = dishes[i]
  insertDish.run(d.id, d.name, d.image_url, d.restaurant_id, d.location, d.cuisine, d.description, d.price, d.lat, d.lng)
  const rest = restaurants.find(r => r.id === d.restaurant_id)!
  insertDishFts.run(i + 1, d.name, d.cuisine, d.description, d.location, rest.name)
}

// Dish images
const dishImages = [
  { dish_id: 'd1', images: ['https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=800&q=80'] },
  { dish_id: 'd2', images: ['https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80'] },
  { dish_id: 'd3', images: ['https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=800&q=80'] },
  { dish_id: 'd4', images: ['https://images.unsplash.com/photo-1614563637806-1d0e645e0940?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80'] },
  { dish_id: 'd5', images: ['https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80'] },
  { dish_id: 'd6', images: ['https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80'] },
  { dish_id: 'd7', images: ['https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80'] },
  { dish_id: 'd8', images: ['https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80'] },
]

const insertDishImage = db.prepare('INSERT INTO dish_images (id, dish_id, image_url, sort_order) VALUES (?, ?, ?, ?)')
for (const di of dishImages) {
  for (let i = 0; i < di.images.length; i++) {
    insertDishImage.run(uuid(), di.dish_id, di.images[i], i)
  }
}

// ---- Ratings ----
// Generate realistic rating distributions
const ratingData: { user_id: string; dish_id: string; tier: string }[] = [
  // Truffle Pasta - S-heavy
  { user_id: 'u1', dish_id: 'd1', tier: 'S' },
  { user_id: 'u2', dish_id: 'd1', tier: 'S' },
  { user_id: 'u3', dish_id: 'd1', tier: 'S' },
  { user_id: 'u4', dish_id: 'd1', tier: 'A' },
  { user_id: 'u5', dish_id: 'd1', tier: 'A' },
  { user_id: 'u6', dish_id: 'd1', tier: 'B' },
  // Spicy Tuna - A-heavy
  { user_id: 'u1', dish_id: 'd2', tier: 'A' },
  { user_id: 'u2', dish_id: 'd2', tier: 'A' },
  { user_id: 'u3', dish_id: 'd2', tier: 'S' },
  { user_id: 'u4', dish_id: 'd2', tier: 'B' },
  { user_id: 'u5', dish_id: 'd2', tier: 'A' },
  // KFC - S-tier consensus
  { user_id: 'u1', dish_id: 'd3', tier: 'S' },
  { user_id: 'u2', dish_id: 'd3', tier: 'S' },
  { user_id: 'u3', dish_id: 'd3', tier: 'S' },
  { user_id: 'u4', dish_id: 'd3', tier: 'S' },
  { user_id: 'u5', dish_id: 'd3', tier: 'S' },
  { user_id: 'u6', dish_id: 'd3', tier: 'A' },
  { user_id: 'u7', dish_id: 'd3', tier: 'S' },
  // Tonkotsu Ramen
  { user_id: 'u1', dish_id: 'd4', tier: 'S' },
  { user_id: 'u2', dish_id: 'd4', tier: 'S' },
  { user_id: 'u3', dish_id: 'd4', tier: 'A' },
  { user_id: 'u7', dish_id: 'd4', tier: 'S' },
  { user_id: 'u5', dish_id: 'd4', tier: 'A' },
  // Birria Tacos
  { user_id: 'u1', dish_id: 'd5', tier: 'A' },
  { user_id: 'u3', dish_id: 'd5', tier: 'S' },
  { user_id: 'u4', dish_id: 'd5', tier: 'A' },
  { user_id: 'u5', dish_id: 'd5', tier: 'A' },
  // Pad Thai
  { user_id: 'u1', dish_id: 'd6', tier: 'B' },
  { user_id: 'u2', dish_id: 'd6', tier: 'B' },
  { user_id: 'u4', dish_id: 'd6', tier: 'C' },
  // Margherita Pizza - heavily rated S-tier
  { user_id: 'u1', dish_id: 'd7', tier: 'S' },
  { user_id: 'u2', dish_id: 'd7', tier: 'S' },
  { user_id: 'u3', dish_id: 'd7', tier: 'S' },
  { user_id: 'u4', dish_id: 'd7', tier: 'S' },
  { user_id: 'u5', dish_id: 'd7', tier: 'A' },
  { user_id: 'u6', dish_id: 'd7', tier: 'S' },
  { user_id: 'u7', dish_id: 'd7', tier: 'A' },
  // Butter Chicken
  { user_id: 'u1', dish_id: 'd8', tier: 'A' },
  { user_id: 'u3', dish_id: 'd8', tier: 'A' },
  { user_id: 'u4', dish_id: 'd8', tier: 'S' },
  { user_id: 'u6', dish_id: 'd8', tier: 'B' },
]

const insertRating = db.prepare('INSERT INTO ratings (id, user_id, dish_id, tier) VALUES (?, ?, ?, ?)')
for (const r of ratingData) {
  insertRating.run(uuid(), r.user_id, r.dish_id, r.tier)
}

// ---- Reviews ----
const reviewData = [
  { user_id: 'u2', dish_id: 'd1', tier: 'S', text: 'The truffle flavor is insane. Best pasta I\'ve had in NYC, hands down. The handmade fettuccine has the perfect bite.' },
  { user_id: 'u3', dish_id: 'd1', tier: 'S', text: 'Worth every penny. The mushroom blend is unique and the truffle isn\'t overpowering like most places.' },
  { user_id: 'u4', dish_id: 'd1', tier: 'A', text: 'Really solid. Would be S-tier if the portion was a bit bigger for the price.' },
  { user_id: 'u5', dish_id: 'd3', tier: 'S', text: 'The double-fry technique makes the skin SO crispy. Gochujang glaze is perfectly balanced.' },
  { user_id: 'u6', dish_id: 'd3', tier: 'S', text: 'Been eating KFC all over K-Town for years. Seoul Food is the undisputed champion.' },
  { user_id: 'u7', dish_id: 'd4', tier: 'S', text: 'The broth is liquid gold. 18-hour simmer and you can taste every minute of it.' },
]

const insertReview = db.prepare('INSERT INTO reviews (id, user_id, dish_id, tier, text) VALUES (?, ?, ?, ?, ?)')
for (const r of reviewData) {
  insertReview.run(uuid(), r.user_id, r.dish_id, r.tier, r.text)
}

// ---- Follows ----
const followData = [
  { follower_id: 'u2', following_id: 'u1' },
  { follower_id: 'u3', following_id: 'u1' },
  { follower_id: 'u4', following_id: 'u1' },
  { follower_id: 'u5', following_id: 'u1' },
  { follower_id: 'u1', following_id: 'u3' },
  { follower_id: 'u1', following_id: 'u5' },
  { follower_id: 'u6', following_id: 'u1' },
]

const insertFollow = db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)')
for (const f of followData) {
  insertFollow.run(f.follower_id, f.following_id)
}

// ---- Favorites ----
const insertFav = db.prepare('INSERT INTO favorites (user_id, dish_id) VALUES (?, ?)')
insertFav.run('u1', 'd1')
insertFav.run('u1', 'd3')
insertFav.run('u1', 'd7')

// ---- Tier Lists ----
const insertTierList = db.prepare('INSERT INTO tier_lists (id, user_id, title, category, city) VALUES (?, ?, ?, ?, ?)')
insertTierList.run('tl1', 'u1', 'Best Ramen in NYC', 'Ramen', 'New York, NY')
insertTierList.run('tl2', 'u1', "NYC's Top Burgers", 'Burgers', 'New York, NY')

// ---- Cuisine Preferences for demo user ----
const insertPref = db.prepare('INSERT INTO user_cuisine_prefs (user_id, cuisine) VALUES (?, ?)')
for (const cuisine of ['Italian', 'Japanese', 'Korean', 'Mexican']) {
  insertPref.run('u1', cuisine)
}

// ---- Activity Feed ----
const insertActivity = db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
insertActivity.run(uuid(), 'u1', 'rating', 'd3', 'Korean Fried Chicken', '{"tier":"S"}', '2026-02-23 10:00:00')
insertActivity.run(uuid(), 'u3', 'rating', 'd7', 'Margherita Pizza', '{"tier":"S"}', '2026-02-23 09:30:00')
insertActivity.run(uuid(), 'u5', 'rating', 'd3', 'Korean Fried Chicken', '{"tier":"S"}', '2026-02-22 18:00:00')
insertActivity.run(uuid(), 'u2', 'review', 'd1', 'Truffle Mushroom Pasta', '{"tier":"S"}', '2026-02-22 14:00:00')
insertActivity.run(uuid(), 'u7', 'review', 'd4', 'Tonkotsu Ramen', '{"tier":"S"}', '2026-02-21 20:00:00')
insertActivity.run(uuid(), 'u1', 'tier_list', 'tl1', 'Best Ramen in NYC', '{}', '2026-02-20 16:00:00')
insertActivity.run(uuid(), 'u6', 'follow', 'u1', 'FoodieQueen', '{}', '2026-02-20 12:00:00')

console.log('Database seeded successfully!')
console.log(`  ${users.length} users`)
console.log(`  ${restaurants.length} restaurants`)
console.log(`  ${dishes.length} dishes`)
console.log(`  ${ratingData.length} ratings`)
console.log(`  ${reviewData.length} reviews`)
console.log(`  ${followData.length} follows`)
