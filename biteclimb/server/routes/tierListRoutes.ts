import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

// GET /api/tier-lists (public lists + user's own)
router.get('/', optionalAuth, (req: AuthRequest, res) => {
  const { user_id } = req.query
  let query = `
    SELECT tl.*, u.username, u.avatar,
      (SELECT COUNT(*) FROM tier_list_items WHERE tier_list_id = tl.id) as item_count
    FROM tier_lists tl JOIN users u ON tl.user_id = u.id
  `
  const params: unknown[] = []

  if (user_id) {
    query += ' WHERE tl.user_id = ? AND (tl.is_public = 1 OR tl.user_id = ?)'
    params.push(user_id, req.userId || '')
  } else {
    query += ' WHERE tl.is_public = 1'
  }

  query += ' ORDER BY tl.updated_at DESC'
  const lists = db.prepare(query).all(...params)
  res.json(lists)
})

// GET /api/tier-lists/:id
router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const list = db.prepare(`
    SELECT tl.*, u.username, u.avatar
    FROM tier_lists tl JOIN users u ON tl.user_id = u.id
    WHERE tl.id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!list) {
    res.status(404).json({ error: 'Tier list not found' })
    return
  }

  if (!list.is_public && list.user_id !== req.userId) {
    res.status(403).json({ error: 'This tier list is private' })
    return
  }

  const items = db.prepare(`
    SELECT tli.tier, tli.sort_order, r.id as restaurant_id, r.name, r.image_url, r.neighborhood
    FROM tier_list_items tli JOIN restaurants r ON tli.restaurant_id = r.id
    WHERE tli.tier_list_id = ?
    ORDER BY tli.tier, tli.sort_order
  `).all(id)

  res.json({ ...list, items })
})

// POST /api/tier-lists
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { title, category, city, is_public, items } = req.body
  if (!title?.trim()) {
    res.status(400).json({ error: 'Title is required' })
    return
  }

  const id = uuid()
  db.prepare('INSERT INTO tier_lists (id, user_id, title, category, city, is_public) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, req.userId, title.trim(), category || '', city || '', is_public !== false ? 1 : 0
  )

  // Insert items
  if (items && Array.isArray(items)) {
    const insert = db.prepare('INSERT INTO tier_list_items (id, tier_list_id, restaurant_id, tier, sort_order) VALUES (?, ?, ?, ?, ?)')
    for (const item of items) {
      insert.run(uuid(), id, item.restaurant_id, item.tier, item.sort_order || 0)
    }
  }

  // Log activity
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'tier_list', id, title, '{}'
  )

  res.status(201).json({ id })
})

// PUT /api/tier-lists/:id
router.put('/:id', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const list = db.prepare('SELECT user_id FROM tier_lists WHERE id = ?').get(id) as { user_id: string } | undefined

  if (!list) {
    res.status(404).json({ error: 'Tier list not found' })
    return
  }
  if (list.user_id !== req.userId) {
    res.status(403).json({ error: 'Not authorized' })
    return
  }

  const { title, category, city, is_public, items } = req.body

  if (title !== undefined) {
    db.prepare("UPDATE tier_lists SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id)
  }
  if (category !== undefined) {
    db.prepare("UPDATE tier_lists SET category = ?, updated_at = datetime('now') WHERE id = ?").run(category, id)
  }
  if (city !== undefined) {
    db.prepare("UPDATE tier_lists SET city = ?, updated_at = datetime('now') WHERE id = ?").run(city, id)
  }
  if (is_public !== undefined) {
    db.prepare("UPDATE tier_lists SET is_public = ?, updated_at = datetime('now') WHERE id = ?").run(is_public ? 1 : 0, id)
  }

  if (items && Array.isArray(items)) {
    db.prepare('DELETE FROM tier_list_items WHERE tier_list_id = ?').run(id)
    const insert = db.prepare('INSERT INTO tier_list_items (id, tier_list_id, restaurant_id, tier, sort_order) VALUES (?, ?, ?, ?, ?)')
    for (const item of items) {
      insert.run(uuid(), id, item.restaurant_id, item.tier, item.sort_order || 0)
    }
    db.prepare("UPDATE tier_lists SET updated_at = datetime('now') WHERE id = ?").run(id)
  }

  res.json({ success: true })
})

// DELETE /api/tier-lists/:id
router.delete('/:id', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params
  const list = db.prepare('SELECT user_id FROM tier_lists WHERE id = ?').get(id) as { user_id: string } | undefined

  if (!list || list.user_id !== req.userId) {
    res.status(404).json({ error: 'Tier list not found' })
    return
  }

  db.prepare('DELETE FROM tier_lists WHERE id = ?').run(id)
  res.json({ success: true })
})

export default router
