import { Router } from 'express'
import db from '../db.js'
import { optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

function computeRestaurantTier(restaurantId: string): TierType {
  const tierWeights: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
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

  res.json({
    ...restaurant,
    community_tier: computeRestaurantTier(id),
    dishes,
  })
})

export default router
