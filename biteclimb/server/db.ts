import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'biteclimb.db')

const db = new Database(dbPath)

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    food_personality TEXT DEFAULT 'Explorer',
    created_at TEXT DEFAULT (datetime('now')),
    lat REAL DEFAULT NULL,
    lng REAL DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    neighborhood TEXT DEFAULT '',
    lat REAL DEFAULT 0,
    lng REAL DEFAULT 0,
    cuisine TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    restaurant_id TEXT NOT NULL,
    location TEXT DEFAULT '',
    cuisine TEXT DEFAULT '',
    description TEXT DEFAULT '',
    price TEXT DEFAULT '',
    lat REAL DEFAULT 0,
    lng REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  CREATE TABLE IF NOT EXISTS dish_images (
    id TEXT PRIMARY KEY,
    dish_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dish_id TEXT NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('S','A','B','C','D','F')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, dish_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (dish_id) REFERENCES dishes(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dish_id TEXT NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('S','A','B','C','D','F')),
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (dish_id) REFERENCES dishes(id)
  );

  CREATE TABLE IF NOT EXISTS review_helpful (
    user_id TEXT NOT NULL,
    review_id TEXT NOT NULL,
    PRIMARY KEY (user_id, review_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tier_lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT DEFAULT '',
    city TEXT DEFAULT '',
    is_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tier_list_items (
    id TEXT PRIMARY KEY,
    tier_list_id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('S','A','B','C','D','F')),
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (tier_list_id) REFERENCES tier_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL,
    dish_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, dish_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (dish_id) REFERENCES dishes(id)
  );

  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    target_id TEXT DEFAULT '',
    target_name TEXT DEFAULT '',
    meta TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_cuisine_prefs (
    user_id TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    PRIMARY KEY (user_id, cuisine),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS dish_labels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dish_id TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, dish_id, label),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (dish_id) REFERENCES dishes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_dish_labels_dish ON dish_labels(dish_id);
  CREATE INDEX IF NOT EXISTS idx_dish_labels_label ON dish_labels(label);

  CREATE TABLE IF NOT EXISTS dish_elo (
    dish_id TEXT PRIMARY KEY,
    elo_score REAL DEFAULT 1500,
    matches_played INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (dish_id) REFERENCES dishes(id)
  );

  CREATE TABLE IF NOT EXISTS elo_matches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dish_a_id TEXT NOT NULL,
    dish_b_id TEXT NOT NULL,
    winner_id TEXT,
    cuisine TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (dish_a_id) REFERENCES dishes(id),
    FOREIGN KEY (dish_b_id) REFERENCES dishes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_elo_matches_user ON elo_matches(user_id);
  CREATE INDEX IF NOT EXISTS idx_elo_matches_cuisine ON elo_matches(cuisine);

  -- FTS for search
  CREATE VIRTUAL TABLE IF NOT EXISTS dishes_fts USING fts5(
    name, cuisine, description, location, restaurant_name,
    content='', tokenize='porter unicode61'
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS restaurants_fts USING fts5(
    name, neighborhood, cuisine,
    content='', tokenize='porter unicode61'
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_ratings_dish ON ratings(dish_id);
  CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_dish ON reviews(dish_id);
  CREATE INDEX IF NOT EXISTS idx_dishes_cuisine ON dishes(cuisine);
  CREATE INDEX IF NOT EXISTS idx_dishes_restaurant ON dishes(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at);
  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
  CREATE INDEX IF NOT EXISTS idx_tier_lists_user ON tier_lists(user_id);

  -- Check-ins: "I ate this" atomic action
  CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dish_id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL,
    photo_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (dish_id) REFERENCES dishes(id),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
  CREATE INDEX IF NOT EXISTS idx_checkins_dish ON checkins(dish_id);
  CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at);
`)

// Schema migrations — idempotent ALTER TABLE calls for existing databases
const migrations = [
  'ALTER TABLE restaurants ADD COLUMN created_by TEXT DEFAULT NULL',
  'ALTER TABLE dishes ADD COLUMN created_by TEXT DEFAULT NULL',
  'ALTER TABLE tier_list_items ADD COLUMN dish_id TEXT DEFAULT NULL',
]

for (const sql of migrations) {
  try { db.exec(sql) } catch { /* column already exists */ }
}

export default db
