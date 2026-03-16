import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

// GET /api/checkins/me — User's food diary (chronological check-in history)
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50)
  const offset = Number(req.query.offset) || 0

  const checkins = db.prepare(`
    SELECT c.id, c.dish_id, c.restaurant_id, c.photo_url, c.notes, c.created_at,
      d.name as dish_name, d.image_url as dish_image, d.cuisine,
      r.name as restaurant_name,
      (SELECT tier FROM ratings WHERE user_id = c.user_id AND dish_id = c.dish_id) as tier
    FROM checkins c
    JOIN dishes d ON c.dish_id = d.id
    JOIN restaurants r ON c.restaurant_id = r.id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, limit, offset) as {
    id: string
    dish_id: string
    restaurant_id: string
    photo_url: string
    notes: string
    created_at: string
    dish_name: string
    dish_image: string
    cuisine: string
    restaurant_name: string
    tier: string | null
  }[]

  res.json(checkins)
})

export default router
