import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

// ── Shared utilities ──────────────────────────────────────────────────────────

const TIER_WEIGHTS: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
const BAYESIAN_M = 20 // confidence threshold

/** Compute raw weighted score from a ratings distribution array. */
function computeObservedScore(ratings: { tier: TierType; count: number }[]): { score: number; count: number } {
  let totalWeight = 0
  let totalCount = 0
  for (const r of ratings) {
    totalWeight += TIER_WEIGHTS[r.tier] * r.count
    totalCount += r.count
  }
  return { score: totalCount > 0 ? totalWeight / totalCount : 0, count: totalCount }
}

/** Bayesian average: pulls new items toward global mean to reduce noise. */
function bayesianScore(observedScore: number, n: number, globalMean: number, m = BAYESIAN_M): number {
  if (n === 0) return globalMean
  return (n / (n + m)) * observedScore + (m / (n + m)) * globalMean
}

/** Convert a numeric observed score to a tier badge (uses raw score, not Bayesian, so badge stays honest). */
function scoreToBadgeTier(score: number): TierType {
  if (score >= 5.5) return 'S'
  if (score >= 4.5) return 'A'
  if (score >= 3.5) return 'B'
  if (score >= 2.5) return 'C'
  if (score >= 1.5) return 'D'
  return 'F'
}

/** Compute community tier badge for a restaurant from all its dish ratings. */
function computeRestaurantTier(restaurantId: string): TierType {
  const ratings = db.prepare(`
    SELECT r.tier, COUNT(*) as count
    FROM ratings r JOIN dishes d ON r.dish_id = d.id
    WHERE d.restaurant_id = ?
    GROUP BY r.tier
  `).all(restaurantId) as { tier: TierType; count: number }[]
  const { score, count } = computeObservedScore(ratings)
  return count === 0 ? 'C' : scoreToBadgeTier(score)
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/restaurants
router.get('/', optionalAuth, (_req: AuthRequest, res) => {
  const restaurants = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id) as rating_count
    FROM restaurants r
    ORDER BY rating_count DESC
  `).all() as Record<string, unknown>[]

  const enriched = restaurants.map(r => ({
    id: r.id,
    name: r.name,
    image_url: r.image_url,
    neighborhood: r.neighborhood,
    cuisine: r.cuisine,
    community_tier: computeRestaurantTier(r.id as string),
    rating_count: r.rating_count,
    lat: r.lat,
    lng: r.lng,
  }))

  res.json(enriched)
})

// GET /api/restaurants/top-by-cuisine
// Returns Bayesian-ranked restaurants per cuisine with velocity scores.
router.get('/top-by-cuisine', optionalAuth, (req: AuthRequest, res) => {
  const { cuisine } = req.query

  // Determine cuisines to process
  const cuisines: string[] = []
  if (cuisine && typeof cuisine === 'string' && cuisine !== 'All') {
    cuisines.push(cuisine)
  } else {
    const rows = db.prepare('SELECT DISTINCT cuisine FROM restaurants WHERE cuisine != ""').all() as { cuisine: string }[]
    cuisines.push(...rows.map(r => r.cuisine))
  }

  const results: Record<string, unknown[]> = {}

  for (const c of cuisines) {
    // Fetch all restaurants in this cuisine with rating counts (lifetime + recent)
    const restaurants = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id) as rating_count,
        (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id AND rt.created_at > datetime('now', '-7 days')) as recent_ratings,
        CAST((julianday('now') - julianday(r.created_at)) AS INTEGER) as days_since_created
      FROM restaurants r
      WHERE r.cuisine = ?
    `).all(c) as Record<string, unknown>[]

    // Compute per-restaurant observed scores and gather them to find the cuisine global mean
    type ScoredRestaurant = {
      raw: Record<string, unknown>
      observedScore: number
      ratingCount: number
    }

    const scoredList: ScoredRestaurant[] = restaurants.map(r => {
      const ratingRows = db.prepare(`
        SELECT rt.tier, COUNT(*) as count
        FROM ratings rt JOIN dishes d ON rt.dish_id = d.id
        WHERE d.restaurant_id = ?
        GROUP BY rt.tier
      `).all(r.id) as { tier: TierType; count: number }[]
      const { score, count } = computeObservedScore(ratingRows)
      return { raw: r, observedScore: score, ratingCount: count }
    })

    // Compute global mean for this cuisine (across all rated restaurants)
    const ratedInCuisine = scoredList.filter(s => s.ratingCount > 0)
    const globalMean = ratedInCuisine.length > 0
      ? ratedInCuisine.reduce((sum, s) => sum + s.observedScore, 0) / ratedInCuisine.length
      : 3.5 // default fallback to mid-range

    // Build final ranked list with Bayesian scores and velocity
    const ranked = scoredList.map(({ raw: r, observedScore, ratingCount }) => {
      const bScore = bayesianScore(observedScore, ratingCount, globalMean)
      const tier = ratingCount === 0 ? 'C' : scoreToBadgeTier(observedScore)

      const recentRatings = r.recent_ratings as number
      const lifetimeRatings = ratingCount
      const daysSinceCreated = Math.max((r.days_since_created as number) || 1, 1)

      // Velocity: recent weekly rate vs lifetime daily rate
      // velocity = (recent_ratings / 7) / max(lifetime_ratings / days_since_created, 0.1)
      const lifetimeDailyRate = Math.max(lifetimeRatings / daysSinceCreated, 0.1)
      const rawVelocity = (recentRatings / 7) / lifetimeDailyRate
      const velocity = Math.min(rawVelocity, 10)

      // Get top 3 dishes for this restaurant
      const topDishes = db.prepare(`
        SELECT d.id, d.name, d.image_url, d.price,
          (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as dish_rating_count
        FROM dishes d
        WHERE d.restaurant_id = ?
        ORDER BY dish_rating_count DESC
        LIMIT 3
      `).all(r.id) as Record<string, unknown>[]

      const topDishesEnriched = topDishes.map(d => {
        const dRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(d.id) as { tier: TierType; count: number }[]
        const { score: dScore, count: dCount } = computeObservedScore(dRatings)
        const dTier: TierType = dCount === 0 ? 'C' : scoreToBadgeTier(dScore)

        const labels = db.prepare(`
          SELECT label, COUNT(*) as count
          FROM dish_labels WHERE dish_id = ?
          GROUP BY label ORDER BY count DESC
        `).all(d.id) as { label: string; count: number }[]

        return { ...d, tier: dTier, labels }
      })

      return {
        id: r.id,
        name: r.name,
        image_url: r.image_url,
        neighborhood: r.neighborhood,
        cuisine: c,
        community_tier: tier as TierType,
        bayesian_score: Math.round(bScore * 1000) / 1000,
        observed_score: Math.round(observedScore * 1000) / 1000,
        rating_count: ratingCount,
        recent_ratings: recentRatings,
        velocity: Math.round(velocity * 100) / 100,
        top_dishes: topDishesEnriched,
        is_newcomer: ratingCount < 10,
        rank: 0,
      }
    })

    // Sort by Bayesian score descending
    ranked.sort((a, b) => b.bayesian_score - a.bayesian_score)
    ranked.forEach((r, i) => { r.rank = i + 1 })

    results[c] = ranked
  }

  res.json(results)
})

// GET /api/restaurants/rising
// Returns top restaurants sorted by velocity score (replaces /challengers).
router.get('/rising', optionalAuth, (_req: AuthRequest, res) => {
  const allRestaurants = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id) as rating_count,
      (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id AND rt.created_at > datetime('now', '-7 days')) as week_ratings,
      CAST((julianday('now') - julianday(r.created_at)) AS INTEGER) as days_since_created
    FROM restaurants r
    WHERE r.cuisine != ''
  `).all() as Record<string, unknown>[]

  const withVelocity = allRestaurants.map(r => {
    const recentRatings = r.week_ratings as number
    const lifetimeRatings = r.rating_count as number
    const daysSinceCreated = Math.max((r.days_since_created as number) || 1, 1)

    const lifetimeDailyRate = Math.max(lifetimeRatings / daysSinceCreated, 0.1)
    const rawVelocity = (recentRatings / 7) / lifetimeDailyRate
    const velocity = Math.min(rawVelocity, 10)

    return { raw: r, velocity, recentRatings, lifetimeRatings }
  })

  // Filter to velocity > 1.2 (20% above baseline)
  const rising = withVelocity.filter(r => r.velocity > 1.2)

  // Sort by velocity descending, take top 10
  rising.sort((a, b) => b.velocity - a.velocity)
  const top10 = rising.slice(0, 10)

  const enriched = top10.map(({ raw: r, velocity, recentRatings }) => {
    const communityTier = computeRestaurantTier(r.id as string)

    // Get the top dish for this restaurant
    const topDishRow = db.prepare(`
      SELECT d.id, d.name, d.image_url, d.price,
        (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as dish_rating_count
      FROM dishes d
      WHERE d.restaurant_id = ?
      ORDER BY dish_rating_count DESC
      LIMIT 1
    `).get(r.id) as Record<string, unknown> | undefined

    let topDish: Record<string, unknown> | null = null
    if (topDishRow) {
      const dRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(topDishRow.id) as { tier: TierType; count: number }[]
      const { score: dScore, count: dCount } = computeObservedScore(dRatings)
      const dTier: TierType = dCount === 0 ? 'C' : scoreToBadgeTier(dScore)

      const labels = db.prepare(`
        SELECT label, COUNT(*) as count
        FROM dish_labels WHERE dish_id = ?
        GROUP BY label ORDER BY count DESC LIMIT 2
      `).all(topDishRow.id) as { label: string; count: number }[]

      topDish = {
        id: topDishRow.id,
        name: topDishRow.name,
        image_url: topDishRow.image_url,
        tier: dTier,
        labels,
      }
    }

    return {
      id: r.id,
      name: r.name,
      image_url: r.image_url,
      cuisine: r.cuisine,
      community_tier: communityTier,
      velocity: Math.round(velocity * 100) / 100,
      week_ratings: recentRatings,
      top_dish: topDish,
    }
  })

  res.json(enriched)
})

// POST /api/restaurants — Create a new user-submitted restaurant
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { name, cuisine, neighborhood, lat, lng, image_url } = req.body as {
    name?: string; cuisine?: string; neighborhood?: string; lat?: number; lng?: number; image_url?: string
  }

  if (!name || name.length < 2 || name.length > 100) {
    res.status(400).json({ error: 'Name must be 2-100 characters' })
    return
  }
  if (!cuisine) {
    res.status(400).json({ error: 'Cuisine is required' })
    return
  }

  const id = uuid()
  db.prepare(`
    INSERT INTO restaurants (id, name, image_url, neighborhood, lat, lng, cuisine, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, image_url || '', neighborhood || '', lat ?? 0, lng ?? 0, cuisine, req.userId)

  // Insert into FTS
  try {
    const maxRowid = (db.prepare('SELECT MAX(rowid) as m FROM restaurants_fts').get() as { m: number | null })?.m ?? 0
    db.prepare('INSERT INTO restaurants_fts(rowid, name, neighborhood, cuisine) VALUES (?, ?, ?, ?)').run(
      maxRowid + 1, name, neighborhood || '', cuisine
    )
  } catch { /* FTS insert failure is non-critical */ }

  res.status(201).json({ id, name })
})

// PUT /api/restaurants/:id — Edit a user-created restaurant (creator only)
router.put('/:id', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const restaurant = db.prepare('SELECT created_by FROM restaurants WHERE id = ?').get(id) as { created_by: string | null } | undefined
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' })
    return
  }
  if (restaurant.created_by !== req.userId) {
    res.status(403).json({ error: 'Only the creator can edit this restaurant' })
    return
  }

  const { name, cuisine, neighborhood, lat, lng, image_url } = req.body
  const updates: string[] = []
  const params: unknown[] = []

  if (name !== undefined) { updates.push('name = ?'); params.push(name) }
  if (cuisine !== undefined) { updates.push('cuisine = ?'); params.push(cuisine) }
  if (neighborhood !== undefined) { updates.push('neighborhood = ?'); params.push(neighborhood) }
  if (lat !== undefined) { updates.push('lat = ?'); params.push(lat) }
  if (lng !== undefined) { updates.push('lng = ?'); params.push(lng) }
  if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url) }

  if (updates.length > 0) {
    params.push(id)
    db.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  res.json({ success: true })
})

// GET /api/restaurants/:id
router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' })
    return
  }

  // Fetch all dishes for this restaurant with their rating counts
  const dishes = db.prepare(`
    SELECT d.id, d.name, d.image_url, d.cuisine, d.price, d.location,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rating_count
    FROM dishes d WHERE d.restaurant_id = ?
  `).all(id) as Record<string, unknown>[]

  // Compute the cuisine-level global mean for Bayesian scoring
  const cuisineRatingRows = db.prepare(`
    SELECT rt.tier, COUNT(*) as count
    FROM ratings rt
    JOIN dishes d ON rt.dish_id = d.id
    WHERE d.cuisine = (SELECT cuisine FROM restaurants WHERE id = ?)
    GROUP BY rt.tier
  `).all(id) as { tier: TierType; count: number }[]
  const { score: cuisineTotal, count: cuisineCount } = computeObservedScore(cuisineRatingRows)
  const cuisineGlobalMean = cuisineCount > 0 ? cuisineTotal : 3.5

  // Enrich dishes with Bayesian score, tier, labels, and worth_it_pct
  const dishesEnriched = dishes.map(d => {
    const labels = db.prepare(`
      SELECT label, COUNT(*) as count
      FROM dish_labels WHERE dish_id = ?
      GROUP BY label ORDER BY count DESC
    `).all(d.id) as { label: string; count: number }[]

    const dRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(d.id) as { tier: TierType; count: number }[]
    const { score: dObserved, count: dCount } = computeObservedScore(dRatings)
    const dTier: TierType = dCount === 0 ? 'C' : scoreToBadgeTier(dObserved)
    const dBayesian = bayesianScore(dObserved, dCount, cuisineGlobalMean)

    // worth_it_pct: % of S + A ratings
    const ratingMap: Record<string, number> = {}
    for (const dr of dRatings) ratingMap[dr.tier] = dr.count
    const worthItCount = (ratingMap['S'] || 0) + (ratingMap['A'] || 0)
    const worth_it_pct = dCount > 0 ? Math.round((worthItCount / dCount) * 100) : 0

    return {
      ...d,
      tier: dTier,
      labels,
      bayesian_score: Math.round(dBayesian * 1000) / 1000,
      observed_score: Math.round(dObserved * 1000) / 1000,
      rating_count: dCount,
      worth_it_pct,
      _bayesian: dBayesian, // internal sort key, removed before response
    }
  })

  // Sort by Bayesian score descending — best dish is #1
  dishesEnriched.sort((a, b) => (b._bayesian as number) - (a._bayesian as number))

  // Auto-assign "Known For" label to the top dish
  if (dishesEnriched.length > 0) {
    const topDish = dishesEnriched[0]
    const labelsArr = topDish.labels as { label: string; count: number }[]
    if (!labelsArr.some(l => l.label === 'Known For')) {
      labelsArr.unshift({ label: 'Known For', count: -1 }) // -1 = auto-assigned
    }
  }

  // Strip internal sort key before sending
  const finalDishes = dishesEnriched.map(({ _bayesian, ...rest }) => rest)

  res.json({
    ...restaurant,
    community_tier: computeRestaurantTier(id),
    dishes: finalDishes,
  })
})

export default router
