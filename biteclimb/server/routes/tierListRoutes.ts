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
  const { cuisine } = req.query

  let query = `
    SELECT r.tier, r.dish_id, d.name, d.image_url, d.price,
      rest.name as restaurant_name
    FROM ratings r
    JOIN dishes d ON r.dish_id = d.id
    JOIN restaurants rest ON d.restaurant_id = rest.id
    WHERE r.user_id = ?
  `
  const params: unknown[] = [req.userId]

  if (cuisine && typeof cuisine === 'string' && cuisine !== 'All') {
    query += ' AND d.cuisine = ?'
    params.push(cuisine)
  }

  query += ' ORDER BY CASE r.tier WHEN \'S\' THEN 1 WHEN \'A\' THEN 2 WHEN \'B\' THEN 3 WHEN \'C\' THEN 4 WHEN \'D\' THEN 5 WHEN \'F\' THEN 6 END, d.name'

  const ratings = db.prepare(query).all(...params) as {
    tier: string
    dish_id: string
    name: string
    image_url: string
    price: string
    restaurant_name: string
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

  // Fetch items — support both dish_id (new) and restaurant_id (legacy) items
  const rawItems = db.prepare(`
    SELECT tli.tier, tli.sort_order, tli.restaurant_id, tli.dish_id
    FROM tier_list_items tli
    WHERE tli.tier_list_id = ?
    ORDER BY tli.tier, tli.sort_order
  `).all(id) as { tier: string; sort_order: number; restaurant_id: string | null; dish_id: string | null }[]

  const items = rawItems.map(item => {
    if (item.dish_id) {
      // New dish-based item
      const dish = db.prepare(`
        SELECT d.name, d.image_url, d.price, r.name as restaurant_name
        FROM dishes d
        LEFT JOIN restaurants r ON d.restaurant_id = r.id
        WHERE d.id = ?
      `).get(item.dish_id) as { name: string; image_url: string; price: string; restaurant_name: string } | undefined
      return {
        tier: item.tier,
        sort_order: item.sort_order,
        dish_id: item.dish_id,
        name: dish?.name || 'Unknown Dish',
        image_url: dish?.image_url || '',
        restaurant_name: dish?.restaurant_name || '',
        price: dish?.price || '',
      }
    } else if (item.restaurant_id) {
      // Legacy restaurant-based item
      const restaurant = db.prepare('SELECT name, image_url, neighborhood FROM restaurants WHERE id = ?').get(item.restaurant_id) as {
        name: string; image_url: string; neighborhood: string
      } | undefined
      return {
        tier: item.tier,
        sort_order: item.sort_order,
        restaurant_id: item.restaurant_id,
        name: restaurant?.name || 'Unknown Restaurant',
        image_url: restaurant?.image_url || '',
        neighborhood: restaurant?.neighborhood || '',
      }
    }
    return { tier: item.tier, sort_order: item.sort_order, name: 'Unknown', image_url: '' }
  })

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

  // Insert items — support both dish_id and restaurant_id
  if (items && Array.isArray(items)) {
    const insert = db.prepare('INSERT INTO tier_list_items (id, tier_list_id, restaurant_id, dish_id, tier, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    for (const item of items) {
      insert.run(uuid(), id, item.restaurant_id || null, item.dish_id || null, item.tier, item.sort_order || 0)
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
    const insert = db.prepare('INSERT INTO tier_list_items (id, tier_list_id, restaurant_id, dish_id, tier, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    for (const item of items) {
      insert.run(uuid(), id, item.restaurant_id || null, item.dish_id || null, item.tier, item.sort_order || 0)
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
