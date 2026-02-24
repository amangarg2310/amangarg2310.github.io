import { Router } from 'express'
import db from '../db.js'
import { optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
const TIER_WEIGHTS: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }

function computeRestaurantTier(restaurantId: string): TierType {
  const ratings = db.prepare(`
    SELECT r.tier, COUNT(*) as count
    FROM ratings r JOIN dishes d ON r.dish_id = d.id
    WHERE d.restaurant_id = ?
    GROUP BY r.tier
  `).all(restaurantId) as { tier: TierType; count: number }[]
  if (ratings.length === 0) return 'C'
  let totalWeight = 0
  let totalCount = 0
  for (const r of ratings) {
    totalWeight += TIER_WEIGHTS[r.tier] * r.count
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

function computeWeightedScore(restaurantId: string): number {
  const ratings = db.prepare(`
    SELECT r.tier, COUNT(*) as count
    FROM ratings r JOIN dishes d ON r.dish_id = d.id
    WHERE d.restaurant_id = ?
    GROUP BY r.tier
  `).all(restaurantId) as { tier: TierType; count: number }[]
  if (ratings.length === 0) return 0
  let totalWeight = 0
  let totalCount = 0
  for (const r of ratings) {
    totalWeight += TIER_WEIGHTS[r.tier] * r.count
    totalCount += r.count
  }
  return totalWeight / totalCount
}

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
// Returns the best restaurants ranked by aggregate tier score for a given cuisine
router.get('/top-by-cuisine', optionalAuth, (req: AuthRequest, res) => {
  const { cuisine } = req.query

  // Get all cuisines if none specified
  const cuisines: string[] = []
  if (cuisine && typeof cuisine === 'string' && cuisine !== 'All') {
    cuisines.push(cuisine)
  } else {
    const rows = db.prepare('SELECT DISTINCT cuisine FROM restaurants WHERE cuisine != ""').all() as { cuisine: string }[]
    cuisines.push(...rows.map(r => r.cuisine))
  }

  const results: Record<string, unknown[]> = {}

  for (const c of cuisines) {
    const restaurants = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id) as rating_count,
        (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id AND rt.created_at > datetime('now', '-14 days')) as recent_ratings
      FROM restaurants r
      WHERE r.cuisine = ?
      ORDER BY rating_count DESC
    `).all(c) as Record<string, unknown>[]

    const ranked = restaurants.map(r => {
      const score = computeWeightedScore(r.id as string)
      const tier = computeRestaurantTier(r.id as string)
      const ratingCount = r.rating_count as number

      // Get top dishes for this restaurant
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
        let dTotal = 0, dCount = 0
        for (const dr of dRatings) { dTotal += TIER_WEIGHTS[dr.tier] * dr.count; dCount += dr.count }
        const dAvg = dCount > 0 ? dTotal / dCount : 0
        let dTier: TierType = 'C'
        if (dAvg >= 5.5) dTier = 'S'
        else if (dAvg >= 4.5) dTier = 'A'
        else if (dAvg >= 3.5) dTier = 'B'
        else if (dAvg >= 2.5) dTier = 'C'
        else if (dAvg >= 1.5) dTier = 'D'
        else if (dCount > 0) dTier = 'F'

        // Get labels for this dish
        const labels = db.prepare(`
          SELECT label, COUNT(*) as count
          FROM dish_labels WHERE dish_id = ?
          GROUP BY label ORDER BY count DESC
        `).all(d.id) as { label: string; count: number }[]

        return { ...d, tier: dTier, labels }
      })

      // Confidence: more ratings = more confidence (0-1 scale, soft cap at 20 ratings)
      const confidence = Math.min(ratingCount / 20, 1)

      // Momentum: recent ratings velocity
      const recentRatings = r.recent_ratings as number
      const momentum = recentRatings > 0 ? recentRatings / 14 : 0 // ratings per day over 14 days

      return {
        id: r.id,
        name: r.name,
        image_url: r.image_url,
        neighborhood: r.neighborhood,
        cuisine: c,
        community_tier: tier,
        score: Math.round(score * 100) / 100,
        rating_count: ratingCount,
        confidence: Math.round(confidence * 100) / 100,
        momentum: Math.round(momentum * 100) / 100,
        recent_ratings: recentRatings,
        top_dishes: topDishesEnriched,
        is_newcomer: ratingCount < 10,
        rank: 0,
      }
    })

    // Sort by score (weighted tier average), with confidence as tiebreaker
    ranked.sort((a, b) => {
      const scoreDiff = b.score - a.score
      if (Math.abs(scoreDiff) > 0.1) return scoreDiff
      return b.confidence - a.confidence
    })

    // Assign ranks
    ranked.forEach((r, i) => { r.rank = i + 1 })

    results[c] = ranked
  }

  res.json(results)
})

// GET /api/restaurants/challengers
// Detects newcomer restaurants that are outperforming established "best" in their cuisine
router.get('/challengers', optionalAuth, (_req: AuthRequest, res) => {
  const cuisines = db.prepare('SELECT DISTINCT cuisine FROM restaurants WHERE cuisine != ""').all() as { cuisine: string }[]
  const challengers: unknown[] = []

  for (const { cuisine } of cuisines) {
    const restaurants = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id) as rating_count,
        (SELECT COUNT(*) FROM ratings rt JOIN dishes d ON rt.dish_id = d.id WHERE d.restaurant_id = r.id AND rt.created_at > datetime('now', '-7 days')) as week_ratings,
        r.created_at
      FROM restaurants r
      WHERE r.cuisine = ?
    `).all(cuisine) as Record<string, unknown>[]

    if (restaurants.length < 2) continue

    const scored = restaurants.map(r => ({
      id: r.id as string,
      name: r.name as string,
      image_url: r.image_url as string,
      neighborhood: r.neighborhood as string,
      cuisine,
      score: computeWeightedScore(r.id as string),
      rating_count: r.rating_count as number,
      week_ratings: r.week_ratings as number,
      created_at: r.created_at as string,
    }))

    // Find the established leader (most ratings + high score)
    const established = [...scored]
      .filter(r => r.rating_count >= 5)
      .sort((a, b) => b.score - a.score || b.rating_count - a.rating_count)

    if (established.length === 0) continue
    const leader = established[0]

    // Find newcomers (< 10 ratings) that are scoring higher than the leader
    // OR have high recent momentum
    const newcomers = scored.filter(r =>
      r.id !== leader.id &&
      r.rating_count >= 3 && // minimum threshold to be considered
      r.rating_count < 10 && // still "new"
      (r.score > leader.score || r.week_ratings > leader.week_ratings)
    )

    for (const newcomer of newcomers) {
      // Get the newcomer's best dish vs leader's best dish
      const newcomerBestDish = db.prepare(`
        SELECT d.id, d.name, d.image_url,
          (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rc
        FROM dishes d WHERE d.restaurant_id = ?
        ORDER BY rc DESC LIMIT 1
      `).get(newcomer.id) as Record<string, unknown> | undefined

      const leaderBestDish = db.prepare(`
        SELECT d.id, d.name, d.image_url,
          (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rc
        FROM dishes d WHERE d.restaurant_id = ?
        ORDER BY rc DESC LIMIT 1
      `).get(leader.id) as Record<string, unknown> | undefined

      challengers.push({
        cuisine,
        newcomer: {
          ...newcomer,
          community_tier: computeRestaurantTier(newcomer.id),
          best_dish: newcomerBestDish ? { id: newcomerBestDish.id, name: newcomerBestDish.name, image_url: newcomerBestDish.image_url } : null,
        },
        incumbent: {
          id: leader.id,
          name: leader.name,
          score: leader.score,
          rating_count: leader.rating_count,
          community_tier: computeRestaurantTier(leader.id),
          best_dish: leaderBestDish ? { id: leaderBestDish.id, name: leaderBestDish.name, image_url: leaderBestDish.image_url } : null,
        },
        reason: newcomer.score > leader.score
          ? `Higher average score (${newcomer.score.toFixed(1)} vs ${leader.score.toFixed(1)})`
          : `Hot momentum: ${newcomer.week_ratings} ratings this week`,
      })
    }
  }

  res.json(challengers)
})

// GET /api/restaurants/:id
router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' })
    return
  }

  const dishes = db.prepare(`
    SELECT d.id, d.name, d.image_url, d.cuisine, d.price, d.location,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rating_count
    FROM dishes d WHERE d.restaurant_id = ?
  `).all(id) as Record<string, unknown>[]

  // Enrich dishes with standout labels
  const dishesEnriched = dishes.map(d => {
    const labels = db.prepare(`
      SELECT label, COUNT(*) as count
      FROM dish_labels WHERE dish_id = ?
      GROUP BY label ORDER BY count DESC
    `).all(d.id) as { label: string; count: number }[]

    // Compute dish tier
    const dRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(d.id) as { tier: TierType; count: number }[]
    let dTotal = 0, dCount = 0
    for (const dr of dRatings) { dTotal += TIER_WEIGHTS[dr.tier] * dr.count; dCount += dr.count }
    const dAvg = dCount > 0 ? dTotal / dCount : 0
    let dTier: TierType = 'C'
    if (dAvg >= 5.5) dTier = 'S'
    else if (dAvg >= 4.5) dTier = 'A'
    else if (dAvg >= 3.5) dTier = 'B'
    else if (dAvg >= 2.5) dTier = 'C'
    else if (dAvg >= 1.5) dTier = 'D'
    else if (dCount > 0) dTier = 'F'

    // Auto-assign "Most Popular" to the dish with most ratings
    const isStandout = (d.rating_count as number) >= 5

    return { ...d, tier: dTier, labels, is_standout: isStandout }
  })

  // Sort: standout dishes first, then by rating count
  dishesEnriched.sort((a, b) => {
    if (a.is_standout && !b.is_standout) return -1
    if (!a.is_standout && b.is_standout) return 1
    return (b.rating_count as number) - (a.rating_count as number)
  })

  // Mark the top-rated dish as "Known For"
  if (dishesEnriched.length > 0) {
    const topDish = dishesEnriched[0]
    if (!topDish.labels.some((l: { label: string }) => l.label === 'Known For')) {
      topDish.labels.unshift({ label: 'Known For', count: -1 }) // -1 = auto-assigned
    }
  }

  res.json({
    ...restaurant,
    community_tier: computeRestaurantTier(id),
    dishes: dishesEnriched,
  })
})

export default router
