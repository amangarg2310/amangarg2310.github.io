import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

// GET /api/tries/me — User's try diary (chronological history)
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50)
  const offset = Number(req.query.offset) || 0

  const tries = db.prepare(`
    SELECT t.id, t.product_id, t.photo_url, t.notes, t.created_at,
      p.name as product_name, p.image_url as product_image, p.brand_id,
      b.name as brand_name,
      c.name as category_name, c.emoji as category_emoji,
      (SELECT tier FROM ratings WHERE user_id = t.user_id AND product_id = t.product_id) as tier
    FROM tries t
    JOIN products p ON t.product_id = p.id
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, limit, offset) as {
    id: string
    product_id: string
    photo_url: string
    notes: string
    created_at: string
    product_name: string
    product_image: string
    brand_id: string
    brand_name: string
    category_name: string
    category_emoji: string
    tier: string | null
  }[]

  res.json(tries)
})

export default router
