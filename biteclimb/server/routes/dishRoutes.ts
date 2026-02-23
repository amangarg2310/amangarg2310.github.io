import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

function computeTier(dishId: string): TierType {
  const tierWeights: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
  const ratings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(dishId) as { tier: TierType; count: number }[]
  if (ratings.length === 0) return 'C'
  let totalWeight = 0
  let totalCount = 0
  for (const r of ratings) {
    totalWeight += tierWeights[r.tier] * r.count
    totalCount += r.count
  }
  const avg = totalWeight / totalCount
  if (avg >= 5.5) return 'S'
  if (avg >= 4.5) return 'A'
  if (avg >= 3.5) return 'B'
  if (avg >= 2.5) return 'C'
  if (avg >= 1.5) return 'D'
  return 'F'
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// GET /api/dishes
router.get('/', optionalAuth, (req: AuthRequest, res) => {
  const { cuisine, search, sort, lat, lng, radius } = req.query

  let dishIds: string[] | null = null

  // Full-text search
  if (search && typeof search === 'string' && search.trim()) {
    const ftsResults = db.prepare("SELECT rowid FROM dishes_fts WHERE dishes_fts MATCH ? ORDER BY rank LIMIT 50").all(search + '*') as { rowid: number }[]
    // Map FTS rowids back to dish ids
    const allDishes = db.prepare('SELECT id FROM dishes').all() as { id: string }[]
    dishIds = ftsResults.map(r => allDishes[r.rowid - 1]?.id).filter(Boolean)
  }

  let query = `
    SELECT d.*, r.name as restaurant_name, r.neighborhood,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rating_count,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id AND created_at > datetime('now', '-7 days')) as week_ratings,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id AND created_at > datetime('now', '-1 day')) as today_ratings
    FROM dishes d
    JOIN restaurants r ON d.restaurant_id = r.id
  `
  const params: unknown[] = []
  const conditions: string[] = []

  if (dishIds !== null) {
    if (dishIds.length === 0) {
      res.json([])
      return
    }
    conditions.push(`d.id IN (${dishIds.map(() => '?').join(',')})`)
    params.push(...dishIds)
  }

  if (cuisine && typeof cuisine === 'string' && cuisine !== 'All') {
    conditions.push('d.cuisine = ?')
    params.push(cuisine)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }

  if (sort === 'trending') {
    query += ' ORDER BY week_ratings DESC, rating_count DESC'
  } else if (sort === 'top') {
    query += ' ORDER BY rating_count DESC'
  } else {
    query += ' ORDER BY rating_count DESC'
  }

  const rawDishes = db.prepare(query).all(...params) as Record<string, unknown>[]

  // Enrich with computed tier, images, distance, user's rating, favorite status
  const enriched = rawDishes.map(d => {
    const tier = computeTier(d.id as string)
    const images = db.prepare('SELECT image_url FROM dish_images WHERE dish_id = ? ORDER BY sort_order').all(d.id) as { image_url: string }[]
    const ratingDist = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(d.id) as { tier: string; count: number }[]
    const ratings: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const r of ratingDist) ratings[r.tier] = r.count

    let userRating: string | null = null
    let isFavorite = false
    if (req.userId) {
      const ur = db.prepare('SELECT tier FROM ratings WHERE user_id = ? AND dish_id = ?').get(req.userId, d.id) as { tier: string } | undefined
      userRating = ur?.tier || null
      const fav = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND dish_id = ?').get(req.userId, d.id)
      isFavorite = !!fav
    }

    let distance: number | null = null
    if (lat && lng) {
      distance = haversineDistance(Number(lat), Number(lng), d.lat as number, d.lng as number)
    }

    return {
      id: d.id,
      name: d.name,
      image_url: d.image_url,
      images: images.map(i => i.image_url),
      tier,
      location: d.location,
      restaurant: d.restaurant_name,
      restaurant_id: d.restaurant_id,
      rating_count: d.rating_count,
      cuisine: d.cuisine,
      description: d.description,
      price: d.price,
      ratings,
      trending_delta: d.week_ratings,
      today_ratings: d.today_ratings,
      user_rating: userRating,
      is_favorite: isFavorite,
      distance,
      lat: d.lat,
      lng: d.lng,
    }
  })

  // Sort by distance if geo provided
  if (lat && lng && sort === 'nearby') {
    enriched.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }

  // Filter by radius
  if (radius && lat && lng) {
    const maxDist = Number(radius)
    res.json(enriched.filter(d => (d.distance ?? Infinity) <= maxDist))
    return
  }

  res.json(enriched)
})

// GET /api/dishes/:id
router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const d = db.prepare(`
    SELECT d.*, r.name as restaurant_name, r.neighborhood
    FROM dishes d JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!d) {
    res.status(404).json({ error: 'Dish not found' })
    return
  }

  const tier = computeTier(id)
  const images = db.prepare('SELECT image_url FROM dish_images WHERE dish_id = ? ORDER BY sort_order').all(id) as { image_url: string }[]
  const ratingDist = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(id) as { tier: string; count: number }[]
  const ratingCount = ratingDist.reduce((sum, r) => sum + r.count, 0)
  const ratings: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const r of ratingDist) ratings[r.tier] = r.count

  const todayRatings = db.prepare("SELECT COUNT(*) as count FROM ratings WHERE dish_id = ? AND created_at > datetime('now', '-1 day')").get(id) as { count: number }
  const weekRatings = db.prepare("SELECT COUNT(*) as count FROM ratings WHERE dish_id = ? AND created_at > datetime('now', '-7 days')").get(id) as { count: number }

  // Reviews
  const reviews = db.prepare(`
    SELECT rv.id, rv.tier, rv.text, rv.created_at,
      u.id as user_id, u.username, u.avatar,
      (SELECT COUNT(*) FROM review_helpful WHERE review_id = rv.id) as helpful
    FROM reviews rv JOIN users u ON rv.user_id = u.id
    WHERE rv.dish_id = ?
    ORDER BY rv.created_at DESC
  `).all(id) as Record<string, unknown>[]

  // Similar dishes
  const similar = db.prepare(`
    SELECT d.id, d.name, d.image_url, d.location, d.cuisine,
      r.name as restaurant_name,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rating_count
    FROM dishes d JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id != ? AND (d.cuisine = ? OR d.restaurant_id = ?)
    LIMIT 4
  `).all(id, d.cuisine, d.restaurant_id) as Record<string, unknown>[]

  const similarEnriched = similar.map(s => ({
    ...s,
    restaurant: s.restaurant_name,
    tier: computeTier(s.id as string),
  }))

  let userRating: string | null = null
  let isFavorite = false
  if (req.userId) {
    const ur = db.prepare('SELECT tier FROM ratings WHERE user_id = ? AND dish_id = ?').get(req.userId, id) as { tier: string } | undefined
    userRating = ur?.tier || null
    isFavorite = !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND dish_id = ?').get(req.userId, id)
  }

  res.json({
    id: d.id,
    name: d.name,
    image_url: d.image_url,
    images: images.map(i => i.image_url),
    tier,
    location: d.location,
    restaurant: d.restaurant_name,
    restaurant_id: d.restaurant_id,
    rating_count: ratingCount,
    cuisine: d.cuisine,
    description: d.description,
    price: d.price,
    ratings,
    trending_delta: weekRatings.count,
    today_ratings: todayRatings.count,
    reviews,
    similar: similarEnriched,
    user_rating: userRating,
    is_favorite: isFavorite,
    lat: d.lat,
    lng: d.lng,
  })
})

// POST /api/dishes/:id/rate
router.post('/:id/rate', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const { tier } = req.body
  if (!['S', 'A', 'B', 'C', 'D', 'F'].includes(tier)) {
    res.status(400).json({ error: 'Invalid tier' })
    return
  }

  // Upsert rating
  const existing = db.prepare('SELECT id FROM ratings WHERE user_id = ? AND dish_id = ?').get(req.userId, id) as { id: string } | undefined
  if (existing) {
    db.prepare('UPDATE ratings SET tier = ?, created_at = datetime(\'now\') WHERE id = ?').run(tier, existing.id)
  } else {
    db.prepare('INSERT INTO ratings (id, user_id, dish_id, tier) VALUES (?, ?, ?, ?)').run(uuid(), req.userId, id, tier)
  }

  // Log activity
  const dish = db.prepare('SELECT name FROM dishes WHERE id = ?').get(id) as { name: string }
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'rating', id, dish.name, JSON.stringify({ tier })
  )

  const newTier = computeTier(id)
  res.json({ success: true, community_tier: newTier })
})

// POST /api/dishes/:id/favorite
router.post('/:id/favorite', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND dish_id = ?').get(req.userId, id)
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND dish_id = ?').run(req.userId, id)
    res.json({ is_favorite: false })
  } else {
    db.prepare('INSERT INTO favorites (user_id, dish_id) VALUES (?, ?)').run(req.userId, id)
    res.json({ is_favorite: true })
  }
})

// POST /api/dishes/:id/reviews
router.post('/:id/reviews', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const { tier, text } = req.body
  if (!['S', 'A', 'B', 'C', 'D', 'F'].includes(tier) || !text?.trim()) {
    res.status(400).json({ error: 'Valid tier and review text required' })
    return
  }

  const reviewId = uuid()
  db.prepare('INSERT INTO reviews (id, user_id, dish_id, tier, text) VALUES (?, ?, ?, ?, ?)').run(reviewId, req.userId, id, tier, text.trim())

  // Log activity
  const dish = db.prepare('SELECT name FROM dishes WHERE id = ?').get(id) as { name: string }
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'review', id, dish.name, JSON.stringify({ tier })
  )

  res.status(201).json({ id: reviewId })
})

// POST /api/reviews/:id/helpful
router.post('/reviews/:id/helpful', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT 1 FROM review_helpful WHERE user_id = ? AND review_id = ?').get(req.userId, id)
  if (existing) {
    db.prepare('DELETE FROM review_helpful WHERE user_id = ? AND review_id = ?').run(req.userId, id)
    res.json({ marked: false })
  } else {
    db.prepare('INSERT INTO review_helpful (user_id, review_id) VALUES (?, ?)').run(req.userId, id)
    res.json({ marked: true })
  }
})

export default router
