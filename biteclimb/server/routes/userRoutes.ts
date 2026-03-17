import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

// GET /api/users/:id/profile
router.get('/:id/profile', optionalAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const user = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.bio, u.product_personality, u.created_at,
      (SELECT COUNT(*) FROM ratings WHERE user_id = u.id) as products_rated,
      (SELECT COUNT(*) FROM tier_lists WHERE user_id = u.id) as tier_lists,
      (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following
    FROM users u WHERE u.id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  // Is current user following this user?
  let is_following = false
  if (req.userId && req.userId !== id) {
    is_following = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.userId, id)
  }

  // Taste DNA (by category)
  const tasteDna = db.prepare(`
    SELECT c.name as category, c.emoji, COUNT(*) as count
    FROM ratings r
    JOIN products p ON r.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE r.user_id = ?
    GROUP BY c.id
    ORDER BY count DESC
  `).all(id) as { category: string; emoji: string; count: number }[]

  // Recent ratings
  const recentRatings = db.prepare(`
    SELECT r.tier, r.created_at, p.id as product_id, p.name, p.image_url,
      b.name as brand_name
    FROM ratings r
    JOIN products p ON r.product_id = p.id
    JOIN brands b ON p.brand_id = b.id
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC LIMIT 5
  `).all(id)

  // Tier lists
  const lists = db.prepare(`
    SELECT tl.id, tl.title, tl.category, tl.created_at,
      (SELECT COUNT(*) FROM tier_list_items WHERE tier_list_id = tl.id) as item_count
    FROM tier_lists tl WHERE tl.user_id = ? AND tl.is_public = 1
    ORDER BY tl.updated_at DESC
  `).all(id)

  res.json({
    ...user,
    is_following,
    taste_dna: tasteDna,
    recent_ratings: recentRatings,
    tier_lists: lists,
  })
})

// POST /api/users/:id/follow
router.post('/:id/follow', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  if (id === req.userId) {
    res.status(400).json({ error: 'Cannot follow yourself' })
    return
  }

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.userId, id)
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.userId, id)
    res.json({ is_following: false })
  } else {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.userId, id)
    // Log activity
    const target = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string }
    db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), req.userId!, 'follow', id, target.username, '{}'
    )
    res.json({ is_following: true })
  }
})

// GET /api/users/:id/activity (activity feed)
router.get('/:id/activity', optionalAuth, (_req: AuthRequest, res) => {
  const { id } = _req.params
  const activities = db.prepare(`
    SELECT a.*, u.username, u.avatar
    FROM activity a JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC LIMIT 20
  `).all(id)

  res.json(activities)
})

// GET /api/feed (activity from people you follow)
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const activities = db.prepare(`
    SELECT a.*, u.username, u.avatar
    FROM activity a
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = ?
    ) OR a.user_id = ?
    ORDER BY a.created_at DESC LIMIT 30
  `).all(req.userId, req.userId)

  res.json(activities)
})

export default router
