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

// GET /api/tier-lists/auto-generate — Generate tier list from user's ratings
router.get('/auto-generate', requireAuth, (req: AuthRequest, res) => {
  const { category } = req.query

  let query = `
    SELECT r.tier, r.product_id, p.name, p.image_url, p.price_range,
      b.name as brand_name
    FROM ratings r
    JOIN products p ON r.product_id = p.id
    JOIN brands b ON p.brand_id = b.id
    WHERE r.user_id = ?
  `
  const params: unknown[] = [req.userId]

  if (category && typeof category === 'string' && category !== 'All') {
    query += ' AND p.category_id = ?'
    params.push(category)
  }

  query += ' ORDER BY CASE r.tier WHEN \'S\' THEN 1 WHEN \'A\' THEN 2 WHEN \'B\' THEN 3 WHEN \'C\' THEN 4 WHEN \'D\' THEN 5 WHEN \'F\' THEN 6 END, p.name'

  const ratings = db.prepare(query).all(...params) as {
    tier: string
    product_id: string
    name: string
    image_url: string
    price_range: string
    brand_name: string
  }[]

  res.json(ratings)
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

  // Fetch items — product-based
  const rawItems = db.prepare(`
    SELECT tli.tier, tli.sort_order, tli.product_id
    FROM tier_list_items tli
    WHERE tli.tier_list_id = ?
    ORDER BY tli.tier, tli.sort_order
  `).all(id) as { tier: string; sort_order: number; product_id: string }[]

  const items = rawItems.map(item => {
    const product = db.prepare(`
      SELECT p.name, p.image_url, p.price_range, p.size,
        b.name as brand_name, c.name as category_name
      FROM products p
      JOIN brands b ON p.brand_id = b.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(item.product_id) as { name: string; image_url: string; price_range: string; size: string; brand_name: string; category_name: string } | undefined
    return {
      tier: item.tier,
      sort_order: item.sort_order,
      product_id: item.product_id,
      name: product?.name || 'Unknown Product',
      image_url: product?.image_url || '',
      brand_name: product?.brand_name || '',
      category_name: product?.category_name || '',
      price_range: product?.price_range || '',
      size: product?.size || '',
    }
  })

  res.json({ ...list, items })
})

// POST /api/tier-lists
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { title, category, is_public, items } = req.body
  if (!title?.trim()) {
    res.status(400).json({ error: 'Title is required' })
    return
  }

  const id = uuid()
  db.prepare('INSERT INTO tier_lists (id, user_id, title, category, is_public) VALUES (?, ?, ?, ?, ?)').run(
    id, req.userId, title.trim(), category || '', is_public !== false ? 1 : 0
  )

  // Insert items — product_id based
  if (items && Array.isArray(items)) {
    const insert = db.prepare('INSERT INTO tier_list_items (id, tier_list_id, product_id, tier, sort_order) VALUES (?, ?, ?, ?, ?)')
    for (const item of items) {
      insert.run(uuid(), id, item.product_id, item.tier, item.sort_order || 0)
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

  const { title, category, is_public, items } = req.body

  if (title !== undefined) {
    db.prepare("UPDATE tier_lists SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id)
  }
  if (category !== undefined) {
    db.prepare("UPDATE tier_lists SET category = ?, updated_at = datetime('now') WHERE id = ?").run(category, id)
  }
  if (is_public !== undefined) {
    db.prepare("UPDATE tier_lists SET is_public = ?, updated_at = datetime('now') WHERE id = ?").run(is_public ? 1 : 0, id)
  }

  if (items && Array.isArray(items)) {
    db.prepare('DELETE FROM tier_list_items WHERE tier_list_id = ?').run(id)
    const insert = db.prepare('INSERT INTO tier_list_items (id, tier_list_id, product_id, tier, sort_order) VALUES (?, ?, ?, ?, ?)')
    for (const item of items) {
      insert.run(uuid(), id, item.product_id, item.tier, item.sort_order || 0)
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
