/**
 * One-time migration: add new dishes to existing seeded database.
 * Run: npx tsx server/migrate-new-dishes.ts
 */
import db from './db.js'
import { v4 as uuid } from 'uuid'

// Check if already migrated
const existing = db.prepare("SELECT COUNT(*) as count FROM dishes WHERE id IN ('d9','d10','d11','d12','d13','d14','d15')").get() as { count: number }
if (existing.count > 0) {
  console.log('New dishes already exist, skipping migration.')
  process.exit(0)
}

console.log('Adding new dishes...')

const newDishes = [
  { id: 'd9',  name: 'Cacio e Pepe', image_url: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r1', location: 'South Tampa', cuisine: 'Italian', description: 'Roman classic: tonnarelli pasta with aged Pecorino, Parmigiano, and cracked black pepper.', price: '$22', lat: 27.9371, lng: -82.4987 },
  { id: 'd10', name: 'Osso Buco', image_url: 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r1', location: 'South Tampa', cuisine: 'Italian', description: 'Braised veal shanks with gremolata and saffron risotto. Weekend special.', price: '$34', lat: 27.9371, lng: -82.4987 },
  { id: 'd11', name: 'Pepperoni Pizza', image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r7', location: 'Downtown Tampa', cuisine: 'Italian', description: 'Wood-fired with cup-and-char pepperoni, fresh mozzarella, and San Marzano sauce.', price: '$16', lat: 27.9494, lng: -82.4586 },
  { id: 'd12', name: 'Garlic Knots', image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r7', location: 'Downtown Tampa', cuisine: 'Italian', description: 'House-made dough knots tossed in garlic butter, fresh parsley, and Parmesan.', price: '$8', lat: 27.9494, lng: -82.4586 },
  { id: 'd13', name: 'Spicy Miso Ramen', image_url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r3', location: 'Seminole Heights, Tampa', cuisine: 'Korean', description: 'Rich miso-based broth with doubanjiang, chashu pork, and a soft-boiled egg.', price: '$17', lat: 27.9863, lng: -82.4590 },
  { id: 'd14', name: 'Chicken Tikka Masala', image_url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r8', location: 'Carrollwood, Tampa', cuisine: 'Indian', description: 'Charred chicken tikka simmered in a spiced tomato cream sauce. Served with basmati rice.', price: '$16', lat: 28.0380, lng: -82.5048 },
  { id: 'd15', name: 'Garlic Naan', image_url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=80', restaurant_id: 'r8', location: 'Carrollwood, Tampa', cuisine: 'Indian', description: 'Tandoor-baked flatbread brushed with garlic butter and fresh coriander.', price: '$4', lat: 28.0380, lng: -82.5048 },
]

const insertDish = db.prepare('INSERT INTO dishes (id, name, image_url, restaurant_id, location, cuisine, description, price, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
const insertDishImage = db.prepare('INSERT INTO dish_images (id, dish_id, image_url, sort_order) VALUES (?, ?, ?, ?)')

for (const d of newDishes) {
  insertDish.run(d.id, d.name, d.image_url, d.restaurant_id, d.location, d.cuisine, d.description, d.price, d.lat, d.lng)
  insertDishImage.run(uuid(), d.id, d.image_url, 0)
}

// Ratings for new dishes
const ratingData = [
  // Cacio e Pepe
  { user_id: 'u1', dish_id: 'd9', tier: 'A' },
  { user_id: 'u2', dish_id: 'd9', tier: 'S' },
  { user_id: 'u3', dish_id: 'd9', tier: 'A' },
  { user_id: 'u4', dish_id: 'd9', tier: 'A' },
  // Osso Buco
  { user_id: 'u1', dish_id: 'd10', tier: 'S' },
  { user_id: 'u3', dish_id: 'd10', tier: 'S' },
  { user_id: 'u5', dish_id: 'd10', tier: 'A' },
  // Pepperoni Pizza
  { user_id: 'u1', dish_id: 'd11', tier: 'A' },
  { user_id: 'u2', dish_id: 'd11', tier: 'S' },
  { user_id: 'u4', dish_id: 'd11', tier: 'A' },
  { user_id: 'u6', dish_id: 'd11', tier: 'A' },
  // Garlic Knots
  { user_id: 'u1', dish_id: 'd12', tier: 'B' },
  { user_id: 'u3', dish_id: 'd12', tier: 'A' },
  { user_id: 'u5', dish_id: 'd12', tier: 'B' },
  // Spicy Miso Ramen
  { user_id: 'u1', dish_id: 'd13', tier: 'S' },
  { user_id: 'u2', dish_id: 'd13', tier: 'S' },
  { user_id: 'u7', dish_id: 'd13', tier: 'S' },
  { user_id: 'u4', dish_id: 'd13', tier: 'A' },
  // Chicken Tikka Masala
  { user_id: 'u1', dish_id: 'd14', tier: 'A' },
  { user_id: 'u4', dish_id: 'd14', tier: 'S' },
  { user_id: 'u6', dish_id: 'd14', tier: 'A' },
  // Garlic Naan
  { user_id: 'u3', dish_id: 'd15', tier: 'B' },
  { user_id: 'u4', dish_id: 'd15', tier: 'A' },
  { user_id: 'u6', dish_id: 'd15', tier: 'B' },
]

const insertRating = db.prepare('INSERT OR IGNORE INTO ratings (id, user_id, dish_id, tier) VALUES (?, ?, ?, ?)')
for (const r of ratingData) {
  insertRating.run(uuid(), r.user_id, r.dish_id, r.tier)
}

// Labels for new dishes
const labelData = [
  { user_id: 'u2', dish_id: 'd9',  label: 'Best Tasting' },
  { user_id: 'u1', dish_id: 'd9',  label: 'Best Value' },
  { user_id: 'u1', dish_id: 'd10', label: 'Best Tasting' },
  { user_id: 'u3', dish_id: 'd10', label: 'Most Unique' },
  { user_id: 'u2', dish_id: 'd11', label: 'Most Popular' },
  { user_id: 'u4', dish_id: 'd11', label: 'Most Popular' },
  { user_id: 'u1', dish_id: 'd13', label: 'Spiciest' },
  { user_id: 'u2', dish_id: 'd13', label: 'Spiciest' },
  { user_id: 'u7', dish_id: 'd13', label: 'Must Try' },
  { user_id: 'u1', dish_id: 'd14', label: 'Best Tasting' },
  { user_id: 'u4', dish_id: 'd14', label: 'Most Popular' },
  { user_id: 'u6', dish_id: 'd14', label: 'Most Popular' },
]

const insertLabel = db.prepare('INSERT OR IGNORE INTO dish_labels (id, user_id, dish_id, label) VALUES (?, ?, ?, ?)')
for (const l of labelData) {
  insertLabel.run(uuid(), l.user_id, l.dish_id, l.label)
}

console.log(`Migration complete: added ${newDishes.length} dishes, ${ratingData.length} ratings, ${labelData.length} labels`)
