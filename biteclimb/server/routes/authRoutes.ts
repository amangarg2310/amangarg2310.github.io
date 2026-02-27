import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { signToken, requireAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { email, username, password } = req.body
  if (!email || !username || !password) {
    res.status(400).json({ error: 'Email, username, and password are required' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  if (username.length < 2 || username.length > 30) {
    res.status(400).json({ error: 'Username must be 2-30 characters' })
    return
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username) as { id: string } | undefined
  if (existing) {
    res.status(409).json({ error: 'Email or username already taken' })
    return
  }

  const id = uuid()
  const passwordHash = bcrypt.hashSync(password, 10)
  db.prepare('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)').run(id, email, username, passwordHash)

  const token = signToken(id)
  res.status(201).json({ token, user: { id, email, username, avatar: '', bio: '', food_personality: 'Explorer' } })
})

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  const user = db.prepare('SELECT id, email, username, password_hash, avatar, bio, food_personality FROM users WHERE email = ?').get(email) as {
    id: string; email: string; username: string; password_hash: string; avatar: string; bio: string; food_personality: string
  } | undefined

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const token = signToken(user.id)
  res.json({
    token,
    user: { id: user.id, email: user.email, username: user.username, avatar: user.avatar, bio: user.bio, food_personality: user.food_personality },
  })
})

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const user = db.prepare(`
    SELECT u.id, u.email, u.username, u.avatar, u.bio, u.food_personality, u.created_at,
      (SELECT COUNT(*) FROM ratings WHERE user_id = u.id) as dishes_rated,
      (SELECT COUNT(*) FROM tier_lists WHERE user_id = u.id) as tier_lists,
      (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following,
      (SELECT COUNT(*) FROM checkins WHERE user_id = u.id) as checkin_count
    FROM users u WHERE u.id = ?
  `).get(req.userId) as Record<string, unknown> | undefined

  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  // Cuisine preferences
  const prefs = db.prepare('SELECT cuisine FROM user_cuisine_prefs WHERE user_id = ?').all(req.userId) as { cuisine: string }[]

  // Taste DNA (computed from actual ratings)
  const tasteDna = db.prepare(`
    SELECT d.cuisine, COUNT(*) as count
    FROM ratings r JOIN dishes d ON r.dish_id = d.id
    WHERE r.user_id = ?
    GROUP BY d.cuisine
    ORDER BY count DESC
  `).all(req.userId) as { cuisine: string; count: number }[]

  // Favorites
  const favorites = db.prepare('SELECT dish_id FROM favorites WHERE user_id = ?').all(req.userId) as { dish_id: string }[]

  // Streak: consecutive days with ratings
  const recentRatings = db.prepare(`
    SELECT DISTINCT date(created_at) as day FROM ratings
    WHERE user_id = ? ORDER BY day DESC LIMIT 30
  `).all(req.userId) as { day: string }[]

  let streak = 0
  const today = new Date().toISOString().split('T')[0]
  for (let i = 0; i < recentRatings.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
    if (recentRatings[i].day === expected) {
      streak++
    } else break
  }

  res.json({
    ...user,
    cuisine_prefs: prefs.map(p => p.cuisine),
    taste_dna: tasteDna,
    favorites: favorites.map(f => f.dish_id),
    streak,
  })
})

// PUT /api/auth/me (update profile)
router.put('/me', requireAuth, (req: AuthRequest, res) => {
  const { username, bio, avatar, food_personality, cuisine_prefs, lat, lng } = req.body
  const updates: string[] = []
  const params: unknown[] = []

  if (username !== undefined) { updates.push('username = ?'); params.push(username) }
  if (bio !== undefined) { updates.push('bio = ?'); params.push(bio) }
  if (avatar !== undefined) { updates.push('avatar = ?'); params.push(avatar) }
  if (food_personality !== undefined) { updates.push('food_personality = ?'); params.push(food_personality) }
  if (lat !== undefined) { updates.push('lat = ?'); params.push(lat) }
  if (lng !== undefined) { updates.push('lng = ?'); params.push(lng) }

  if (updates.length > 0) {
    params.push(req.userId)
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  if (cuisine_prefs && Array.isArray(cuisine_prefs)) {
    db.prepare('DELETE FROM user_cuisine_prefs WHERE user_id = ?').run(req.userId)
    const insert = db.prepare('INSERT INTO user_cuisine_prefs (user_id, cuisine) VALUES (?, ?)')
    for (const c of cuisine_prefs) {
      insert.run(req.userId, c)
    }
  }

  res.json({ success: true })
})

export default router
