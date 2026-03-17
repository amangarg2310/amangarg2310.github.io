import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

function computeTier(productId: string): TierType {
  const tierWeights: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
  const ratings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(productId) as { tier: TierType; count: number }[]
  if (ratings.length === 0) {
    // Cold start: use seed_tier if available
    const product = db.prepare('SELECT seed_tier FROM products WHERE id = ?').get(productId) as { seed_tier: string | null } | undefined
    if (product?.seed_tier && ['S', 'A', 'B', 'C', 'D', 'F'].includes(product.seed_tier)) {
      return product.seed_tier as TierType
    }
    return 'C'
  }
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

// ── Shared ranking utilities ──────────────────────────────────────────────────

const TIER_WEIGHTS_RANKING: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
const BAYESIAN_M = 20 // confidence threshold

/** Compute raw weighted score from a ratings distribution array. */
function computeObservedScore(ratings: { tier: TierType; count: number }[]): { score: number; count: number } {
  let totalWeight = 0
  let totalCount = 0
  for (const r of ratings) {
    totalWeight += TIER_WEIGHTS_RANKING[r.tier] * r.count
    totalCount += r.count
  }
  return { score: totalCount > 0 ? totalWeight / totalCount : 0, count: totalCount }
}

/** For cold start: when rating_count < 5, blend seed_score as baseline. */
function computeObservedScoreWithSeed(ratings: { tier: TierType; count: number }[], seedScore: number | null): { score: number; count: number } {
  const { score, count } = computeObservedScore(ratings)
  if (count >= 5 || seedScore === null) return { score, count }
  // Blend: weight user ratings more as they accumulate
  const userWeight = count / 5
  const blendedScore = userWeight * score + (1 - userWeight) * seedScore
  return { score: blendedScore, count }
}

/** Bayesian average: pulls new items toward global mean to reduce noise. */
function bayesianScore(observedScore: number, n: number, globalMean: number, m = BAYESIAN_M): number {
  if (n === 0) return globalMean
  return (n / (n + m)) * observedScore + (m / (n + m)) * globalMean
}

/** Convert numeric observed score to a tier badge. */
function scoreToBadgeTier(score: number): TierType {
  if (score >= 5.5) return 'S'
  if (score >= 4.5) return 'A'
  if (score >= 3.5) return 'B'
  if (score >= 2.5) return 'C'
  if (score >= 1.5) return 'D'
  return 'F'
}

// ── Valid product labels ──────────────────────────────────────────────────────

const VALID_LABELS = [
  'Most Popular',
  'Best Flavor',
  'Best Value',
  'Most Addictive',
  'Guilty Pleasure',
  'Healthy Pick',
  'Best Texture',
  'Must Try',
  'Overrated',
  'Underrated',
  'Best for Sharing',
]

// ── Statistical Ranking Endpoints (must come BEFORE /:id) ────────────────────

interface ProductRanking {
  id: string
  name: string
  image_url: string
  brand_id: string
  brand_name: string
  category_id: string
  category_name: string
  price_range: string
  tier: TierType
  labels: { label: string; count: number }[]
  bayesian_score: number
  observed_score: number
  composite_score: number
  rating_count: number
  elo_score: number
  matches_played: number
  category_rank: number
  worth_it_pct: number
  friends_rated_count: number
}

// GET /api/products/top-by-category
router.get('/top-by-category', optionalAuth, (req: AuthRequest, res) => {
  const { category } = req.query

  let productQuery = `
    SELECT p.id, p.name, p.image_url, p.brand_id, p.category_id, p.price_range, p.seed_score,
      b.name as brand_name,
      c.name as category_name
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
  `
  const params: unknown[] = []
  if (category && typeof category === 'string' && category !== 'All') {
    productQuery += ' WHERE p.category_id = ?'
    params.push(category)
  }

  const allProducts = db.prepare(productQuery).all(...params) as {
    id: string; name: string; image_url: string; brand_id: string; category_id: string
    price_range: string; seed_score: number | null; brand_name: string; category_name: string
  }[]

  // Group by category
  const byCategory: Record<string, typeof allProducts> = {}
  for (const product of allProducts) {
    const key = product.category_name
    if (!byCategory[key]) byCategory[key] = []
    byCategory[key].push(product)
  }

  const resultsByCategory: Record<string, ProductRanking[]> = {}

  for (const [categoryName, products] of Object.entries(byCategory)) {
    type EnrichedProduct = typeof products[0] & {
      observedScore: number
      ratingCount: number
      ratingDist: { tier: TierType; count: number }[]
    }

    const enrichedProducts: EnrichedProduct[] = products.map(p => {
      const ratingDist = db.prepare(
        'SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier'
      ).all(p.id) as { tier: TierType; count: number }[]
      const { score, count } = computeObservedScoreWithSeed(ratingDist, p.seed_score)
      return { ...p, observedScore: score, ratingCount: count, ratingDist }
    })

    const ratedProducts = enrichedProducts.filter(p => p.ratingCount > 0 || p.seed_score !== null)
    const globalMean = ratedProducts.length > 0
      ? ratedProducts.reduce((sum, p) => sum + p.observedScore, 0) / ratedProducts.length
      : 3.5

    const scoredProducts: ProductRanking[] = enrichedProducts.map(p => {
      const effectiveCount = p.ratingCount > 0 ? p.ratingCount : (p.seed_score !== null ? 3 : 0)
      const effectiveScore = p.ratingCount > 0 ? p.observedScore : (p.seed_score ?? 0)
      const bScore = bayesianScore(effectiveScore, effectiveCount, globalMean)
      const tier = p.ratingCount === 0
        ? (p.seed_score !== null ? scoreToBadgeTier(p.seed_score) : 'C' as TierType)
        : scoreToBadgeTier(p.observedScore)

      const eloRow = db.prepare(
        'SELECT elo_score, matches_played FROM product_elo WHERE product_id = ?'
      ).get(p.id) as { elo_score: number; matches_played: number } | undefined
      const eloScore = eloRow?.elo_score ?? 1500
      const matchesPlayed = eloRow?.matches_played ?? 0

      const eloWeight = Math.min(matchesPlayed / 20, 0.4)
      const normalizedElo = ((eloScore - 1000) / 1000) * 5 + 1
      const compositeScore = (1 - eloWeight) * bScore + eloWeight * normalizedElo

      const labels = db.prepare(`
        SELECT label, COUNT(*) as count
        FROM product_labels WHERE product_id = ?
        GROUP BY label ORDER BY count DESC LIMIT 2
      `).all(p.id) as { label: string; count: number }[]

      const ratingMap: Record<string, number> = {}
      for (const dr of p.ratingDist) ratingMap[dr.tier] = dr.count
      const worthItCount = (ratingMap['S'] || 0) + (ratingMap['A'] || 0)
      const worth_it_pct = p.ratingCount > 0 ? Math.round((worthItCount / p.ratingCount) * 100) : 0

      // friends_rated_count
      let friends_rated_count = 0
      if (req.userId) {
        const frc = db.prepare(`
          SELECT COUNT(DISTINCT r.user_id) as cnt
          FROM ratings r
          JOIN follows f ON f.following_id = r.user_id AND f.follower_id = ?
          WHERE r.product_id = ?
        `).get(req.userId, p.id) as { cnt: number }
        friends_rated_count = frc.cnt
      }

      return {
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        brand_id: p.brand_id,
        brand_name: p.brand_name,
        category_id: p.category_id,
        category_name: categoryName,
        price_range: p.price_range,
        tier: tier as TierType,
        labels,
        bayesian_score: Math.round(bScore * 1000) / 1000,
        observed_score: Math.round(p.observedScore * 1000) / 1000,
        composite_score: Math.round(compositeScore * 1000) / 1000,
        rating_count: p.ratingCount,
        elo_score: Math.round(eloScore * 10) / 10,
        matches_played: matchesPlayed,
        category_rank: 0,
        worth_it_pct,
        friends_rated_count,
      }
    })

    scoredProducts.sort((a, b) => b.composite_score - a.composite_score)
    const top20 = scoredProducts.slice(0, 20)
    top20.forEach((p, i) => { p.category_rank = i + 1 })

    resultsByCategory[categoryName] = top20
  }

  if (category && typeof category === 'string' && category !== 'All') {
    const key = Object.keys(resultsByCategory)[0]
    res.json(key ? resultsByCategory[key] : [])
  } else {
    res.json(resultsByCategory)
  }
})

// GET /api/products/matchup
router.get('/matchup', requireAuth, (req: AuthRequest, res) => {
  const { category } = req.query
  if (!category || typeof category !== 'string') {
    res.status(400).json({ error: 'category query parameter is required (category_id)' })
    return
  }

  const products = db.prepare(`
    SELECT p.id, p.name, p.image_url, p.price_range, p.brand_id,
      b.name as brand_name
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    WHERE p.category_id = ?
  `).all(category) as {
    id: string; name: string; image_url: string; price_range: string
    brand_id: string; brand_name: string
  }[]

  if (products.length < 2) {
    res.status(404).json({ error: 'Not enough products in this category for a matchup' })
    return
  }

  const insertElo = db.prepare('INSERT OR IGNORE INTO product_elo (product_id, category_id) VALUES (?, ?)')
  for (const p of products) {
    insertElo.run(p.id, category)
  }

  const eloMap: Record<string, { elo_score: number; matches_played: number }> = {}
  const eloRows = db.prepare(
    `SELECT product_id, elo_score, matches_played FROM product_elo WHERE product_id IN (${products.map(() => '?').join(',')})`
  ).all(...products.map(p => p.id)) as { product_id: string; elo_score: number; matches_played: number }[]
  for (const row of eloRows) {
    eloMap[row.product_id] = { elo_score: row.elo_score, matches_played: row.matches_played }
  }

  const seenPairs = new Set<string>()
  const seenMatches = db.prepare(`
    SELECT product_a_id, product_b_id FROM elo_matches
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.userId) as { product_a_id: string; product_b_id: string }[]
  for (const m of seenMatches) {
    seenPairs.add([m.product_a_id, m.product_b_id].sort().join('|'))
  }

  const sortedProducts = [...products].sort((a, b) => {
    const aMatches = eloMap[a.id]?.matches_played ?? 0
    const bMatches = eloMap[b.id]?.matches_played ?? 0
    return aMatches - bMatches
  })

  let selectedA: typeof products[0] | null = null
  let selectedB: typeof products[0] | null = null

  outerClose:
  for (let i = 0; i < sortedProducts.length; i++) {
    for (let j = i + 1; j < sortedProducts.length; j++) {
      const a = sortedProducts[i]
      const b = sortedProducts[j]
      if (seenPairs.has([a.id, b.id].sort().join('|'))) continue
      const eloA = eloMap[a.id]?.elo_score ?? 1500
      const eloB = eloMap[b.id]?.elo_score ?? 1500
      if (Math.abs(eloA - eloB) <= 200) {
        selectedA = a
        selectedB = b
        break outerClose
      }
    }
  }

  if (!selectedA || !selectedB) {
    outerAny:
    for (let i = 0; i < sortedProducts.length; i++) {
      for (let j = i + 1; j < sortedProducts.length; j++) {
        const a = sortedProducts[i]
        const b = sortedProducts[j]
        if (!seenPairs.has([a.id, b.id].sort().join('|'))) {
          selectedA = a
          selectedB = b
          break outerAny
        }
      }
    }
  }

  if (!selectedA || !selectedB) {
    selectedA = sortedProducts[0]
    selectedB = sortedProducts[1]
  }

  const buildProductResponse = (p: typeof products[0]) => {
    const elo = eloMap[p.id] ?? { elo_score: 1500, matches_played: 0 }
    return {
      id: p.id,
      name: p.name,
      image_url: p.image_url,
      brand_name: p.brand_name,
      price_range: p.price_range,
      tier: computeTier(p.id),
      elo_score: Math.round(elo.elo_score * 10) / 10,
      matches_played: elo.matches_played,
    }
  }

  res.json({
    product_a: buildProductResponse(selectedA),
    product_b: buildProductResponse(selectedB),
  })
})

// POST /api/products/matchup
router.post('/matchup', requireAuth, (req: AuthRequest, res) => {
  const { product_a_id, product_b_id, winner_id, category_id } = req.body as {
    product_a_id: string; product_b_id: string; winner_id: string | null; category_id: string
  }

  if (!product_a_id || !product_b_id || !category_id) {
    res.status(400).json({ error: 'product_a_id, product_b_id, and category_id are required' })
    return
  }

  if (winner_id !== null && winner_id !== product_a_id && winner_id !== product_b_id) {
    res.status(400).json({ error: 'winner_id must be product_a_id, product_b_id, or null (skip)' })
    return
  }

  db.prepare(`
    INSERT INTO elo_matches (id, user_id, product_a_id, product_b_id, winner_id, category_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), req.userId, product_a_id, product_b_id, winner_id, category_id)

  if (winner_id === null) {
    res.json({ success: true, product_a_elo: null, product_b_elo: null })
    return
  }

  db.prepare('INSERT OR IGNORE INTO product_elo (product_id, category_id) VALUES (?, ?)').run(product_a_id, category_id)
  db.prepare('INSERT OR IGNORE INTO product_elo (product_id, category_id) VALUES (?, ?)').run(product_b_id, category_id)

  const eloA = db.prepare('SELECT elo_score, matches_played FROM product_elo WHERE product_id = ?').get(product_a_id) as { elo_score: number; matches_played: number }
  const eloB = db.prepare('SELECT elo_score, matches_played FROM product_elo WHERE product_id = ?').get(product_b_id) as { elo_score: number; matches_played: number }

  const eloScoreA = eloA.elo_score
  const eloScoreB = eloB.elo_score
  const matchesA = eloA.matches_played
  const matchesB = eloB.matches_played

  const kFactor = (matches: number): number => {
    if (matches < 10) return 40
    if (matches < 30) return 24
    return 16
  }
  const kA = kFactor(matchesA)
  const kB = kFactor(matchesB)

  const expectedA = 1 / (1 + Math.pow(10, (eloScoreB - eloScoreA) / 400))
  const outcomeA = winner_id === product_a_id ? 1 : 0

  const newEloA = eloScoreA + kA * (outcomeA - expectedA)
  const newEloB = eloScoreB + kB * ((1 - outcomeA) - (1 - expectedA))

  db.prepare(`
    UPDATE product_elo
    SET elo_score = ?, matches_played = matches_played + 1, updated_at = datetime('now')
    WHERE product_id = ?
  `).run(newEloA, product_a_id)
  db.prepare(`
    UPDATE product_elo
    SET elo_score = ?, matches_played = matches_played + 1, updated_at = datetime('now')
    WHERE product_id = ?
  `).run(newEloB, product_b_id)

  res.json({
    success: true,
    product_a_elo: Math.round(newEloA * 10) / 10,
    product_b_elo: Math.round(newEloB * 10) / 10,
  })
})

// GET /api/products/elo-rankings
router.get('/elo-rankings', optionalAuth, (req: AuthRequest, res) => {
  const { category } = req.query
  if (!category || typeof category !== 'string') {
    res.status(400).json({ error: 'category query parameter is required (category_id)' })
    return
  }

  const rows = db.prepare(`
    SELECT
      pe.elo_score,
      pe.matches_played,
      p.id as product_id,
      p.name,
      p.image_url,
      p.price_range,
      p.brand_id,
      b.name as brand_name
    FROM product_elo pe
    JOIN products p ON pe.product_id = p.id
    JOIN brands b ON p.brand_id = b.id
    WHERE p.category_id = ?
      AND pe.matches_played >= 3
    ORDER BY pe.elo_score DESC
  `).all(category) as {
    elo_score: number; matches_played: number; product_id: string; name: string
    image_url: string; price_range: string; brand_id: string; brand_name: string
  }[]

  const ranked = rows.map((row, i) => ({
    category_rank: i + 1,
    product_id: row.product_id,
    name: row.name,
    image_url: row.image_url,
    brand_name: row.brand_name,
    price_range: row.price_range,
    tier: computeTier(row.product_id),
    elo_score: Math.round(row.elo_score * 10) / 10,
    matches_played: row.matches_played,
  }))

  res.json(ranked)
})

// ── Existing parameterized routes (must come AFTER static paths above) ────────

// GET /api/products
router.get('/', optionalAuth, (req: AuthRequest, res) => {
  const { category, search, sort } = req.query

  let productIds: string[] | null = null

  // Full-text search
  if (search && typeof search === 'string' && search.trim()) {
    const ftsResults = db.prepare("SELECT rowid FROM products_fts WHERE products_fts MATCH ? ORDER BY rank LIMIT 50").all(search + '*') as { rowid: number }[]
    const allProducts = db.prepare('SELECT id FROM products').all() as { id: string }[]
    productIds = ftsResults.map(r => allProducts[r.rowid - 1]?.id).filter(Boolean)
  }

  let query = `
    SELECT p.*, b.name as brand_name, c.name as category_name, c.emoji as category_emoji,
      (SELECT COUNT(*) FROM ratings WHERE product_id = p.id) as rating_count,
      (SELECT COUNT(*) FROM ratings WHERE product_id = p.id AND created_at > datetime('now', '-7 days')) as week_ratings,
      (SELECT COUNT(*) FROM ratings WHERE product_id = p.id AND created_at > datetime('now', '-1 day')) as today_ratings
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
  `
  const params: unknown[] = []
  const conditions: string[] = []

  if (productIds !== null) {
    if (productIds.length === 0) {
      res.json([])
      return
    }
    conditions.push(`p.id IN (${productIds.map(() => '?').join(',')})`)
    params.push(...productIds)
  }

  if (category && typeof category === 'string' && category !== 'All') {
    conditions.push('p.category_id = ?')
    params.push(category)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }

  if (sort === 'trending') {
    query += ' ORDER BY week_ratings DESC, rating_count DESC'
  } else {
    query += ' ORDER BY rating_count DESC'
  }

  const rawProducts = db.prepare(query).all(...params) as Record<string, unknown>[]

  const enriched = rawProducts.map(p => {
    const tier = computeTier(p.id as string)
    const images = db.prepare('SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order').all(p.id) as { image_url: string }[]
    const ratingDist = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(p.id) as { tier: string; count: number }[]
    const ratings: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const r of ratingDist) ratings[r.tier] = r.count

    let userRating: string | null = null
    let isFavorite = false
    if (req.userId) {
      const ur = db.prepare('SELECT tier FROM ratings WHERE user_id = ? AND product_id = ?').get(req.userId, p.id) as { tier: string } | undefined
      userRating = ur?.tier || null
      const fav = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?').get(req.userId, p.id)
      isFavorite = !!fav
    }

    // friends_rated_count
    let friends_rated_count = 0
    if (req.userId) {
      const frc = db.prepare(`
        SELECT COUNT(DISTINCT r.user_id) as cnt
        FROM ratings r
        JOIN follows f ON f.following_id = r.user_id AND f.follower_id = ?
        WHERE r.product_id = ?
      `).get(req.userId, p.id) as { cnt: number }
      friends_rated_count = frc.cnt
    }

    const labelRows = db.prepare(`
      SELECT label, COUNT(*) as count
      FROM product_labels WHERE product_id = ?
      GROUP BY label ORDER BY count DESC LIMIT 3
    `).all(p.id) as { label: string; count: number }[]

    return {
      id: p.id,
      name: p.name,
      image_url: p.image_url,
      images: images.map(i => i.image_url),
      tier,
      brand: p.brand_name,
      brand_id: p.brand_id,
      category_id: p.category_id,
      category_name: p.category_name,
      category_emoji: p.category_emoji,
      rating_count: p.rating_count,
      description: p.description,
      price_range: p.price_range,
      size: p.size,
      subcategory: p.subcategory,
      ratings,
      trending_delta: p.week_ratings,
      today_ratings: p.today_ratings,
      user_rating: userRating,
      is_favorite: isFavorite,
      labels: labelRows,
      friends_rated_count,
    }
  })

  res.json(enriched)
})

// POST /api/products/reviews/:id/helpful
router.post('/reviews/:id/helpful', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const existing = db.prepare('SELECT 1 FROM review_helpful WHERE user_id = ? AND review_id = ?').get(req.userId, id)
  if (existing) {
    db.prepare('DELETE FROM review_helpful WHERE user_id = ? AND review_id = ?').run(req.userId, id)
    res.json({ marked: false })
  } else {
    db.prepare('INSERT INTO review_helpful (user_id, review_id) VALUES (?, ?)').run(req.userId, id)
    res.json({ marked: true })
  }
})

// GET /api/products/:id
router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const p = db.prepare(`
    SELECT p.*, b.name as brand_name, b.description as brand_description,
      c.name as category_name, c.slug as category_slug, c.emoji as category_emoji
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!p) {
    res.status(404).json({ error: 'Product not found' })
    return
  }

  const tier = computeTier(id)
  const images = db.prepare('SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order').all(id) as { image_url: string }[]
  const ratingDist = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(id) as { tier: string; count: number }[]
  const ratingCount = ratingDist.reduce((sum, r) => sum + r.count, 0)
  const ratings: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const r of ratingDist) ratings[r.tier] = r.count

  const todayRatings = db.prepare("SELECT COUNT(*) as count FROM ratings WHERE product_id = ? AND created_at > datetime('now', '-1 day')").get(id) as { count: number }
  const weekRatings = db.prepare("SELECT COUNT(*) as count FROM ratings WHERE product_id = ? AND created_at > datetime('now', '-7 days')").get(id) as { count: number }

  // Reviews
  const reviews = db.prepare(`
    SELECT rv.id, rv.tier, rv.text, rv.photo_url, rv.created_at,
      u.id as user_id, u.username, u.avatar,
      (SELECT COUNT(*) FROM review_helpful WHERE review_id = rv.id) as helpful
    FROM reviews rv JOIN users u ON rv.user_id = u.id
    WHERE rv.product_id = ?
    ORDER BY rv.created_at DESC
  `).all(id) as Record<string, unknown>[]

  // Similar products (same category or brand)
  const similar = db.prepare(`
    SELECT p.id, p.name, p.image_url, p.price_range,
      b.name as brand_name, c.name as category_name,
      (SELECT COUNT(*) FROM ratings WHERE product_id = p.id) as rating_count
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
    WHERE p.id != ? AND (p.category_id = ? OR p.brand_id = ?)
    LIMIT 4
  `).all(id, p.category_id, p.brand_id) as Record<string, unknown>[]

  const similarEnriched = similar.map(s => ({
    ...s,
    brand: s.brand_name,
    tier: computeTier(s.id as string),
  }))

  // Try count
  const tryCount = (db.prepare('SELECT COUNT(*) as count FROM tries WHERE product_id = ?').get(id) as { count: number }).count

  let userRating: string | null = null
  let isFavorite = false
  let userLabels: string[] = []
  let userTryCount = 0
  if (req.userId) {
    const ur = db.prepare('SELECT tier FROM ratings WHERE user_id = ? AND product_id = ?').get(req.userId, id) as { tier: string } | undefined
    userRating = ur?.tier || null
    isFavorite = !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?').get(req.userId, id)
    const ulRows = db.prepare('SELECT label FROM product_labels WHERE user_id = ? AND product_id = ?').all(req.userId, id) as { label: string }[]
    userLabels = ulRows.map(r => r.label)
    userTryCount = (db.prepare('SELECT COUNT(*) as count FROM tries WHERE user_id = ? AND product_id = ?').get(req.userId, id) as { count: number }).count
  }

  // Product labels (crowdsourced)
  const labelRows = db.prepare(`
    SELECT label, COUNT(*) as count
    FROM product_labels WHERE product_id = ?
    GROUP BY label ORDER BY count DESC
  `).all(id) as { label: string; count: number }[]

  // ELO data
  const eloRow = db.prepare('SELECT elo_score, matches_played FROM product_elo WHERE product_id = ?').get(id) as { elo_score: number; matches_played: number } | undefined
  const eloScore = eloRow?.elo_score ?? null
  const matchesPlayed = eloRow?.matches_played ?? 0

  // Category ELO rank
  let categoryEloRank: number | null = null
  let categoryEloTotal: number | null = null
  if (eloScore !== null && matchesPlayed >= 3) {
    const rankedProducts = db.prepare(`
      SELECT pe.product_id FROM product_elo pe
      JOIN products p2 ON pe.product_id = p2.id
      WHERE p2.category_id = ? AND pe.matches_played >= 3
      ORDER BY pe.elo_score DESC
    `).all(p.category_id) as { product_id: string }[]
    categoryEloTotal = rankedProducts.length
    const rankIdx = rankedProducts.findIndex(r => r.product_id === id)
    categoryEloRank = rankIdx >= 0 ? rankIdx + 1 : null
  }

  // friends_rated_count
  let friends_rated_count = 0
  if (req.userId) {
    const frc = db.prepare(`
      SELECT COUNT(DISTINCT r.user_id) as cnt
      FROM ratings r
      JOIN follows f ON f.following_id = r.user_id AND f.follower_id = ?
      WHERE r.product_id = ?
    `).get(req.userId, id) as { cnt: number }
    friends_rated_count = frc.cnt
  }

  res.json({
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    images: images.map(i => i.image_url),
    tier,
    brand: p.brand_name,
    brand_id: p.brand_id,
    brand_description: p.brand_description,
    category_id: p.category_id,
    category_name: p.category_name,
    category_slug: p.category_slug,
    category_emoji: p.category_emoji,
    rating_count: ratingCount,
    description: p.description,
    price_range: p.price_range,
    size: p.size,
    subcategory: p.subcategory,
    barcode: p.barcode,
    seed_tier: p.seed_tier,
    seed_score: p.seed_score,
    ratings,
    trending_delta: weekRatings.count,
    today_ratings: todayRatings.count,
    reviews,
    similar: similarEnriched,
    user_rating: userRating,
    is_favorite: isFavorite,
    user_labels: userLabels,
    labels: labelRows,
    elo_score: eloScore,
    matches_played: matchesPlayed,
    category_elo_rank: categoryEloRank,
    category_elo_total: categoryEloTotal,
    try_count: tryCount,
    user_try_count: userTryCount,
    friends_rated_count,
  })
})

// POST /api/products/:id/rate
router.post('/:id/rate', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const { tier } = req.body
  if (!['S', 'A', 'B', 'C', 'D', 'F'].includes(tier)) {
    res.status(400).json({ error: 'Invalid tier' })
    return
  }

  const existing = db.prepare('SELECT id FROM ratings WHERE user_id = ? AND product_id = ?').get(req.userId, id) as { id: string } | undefined
  if (existing) {
    db.prepare('UPDATE ratings SET tier = ?, created_at = datetime(\'now\') WHERE id = ?').run(tier, existing.id)
  } else {
    db.prepare('INSERT INTO ratings (id, user_id, product_id, tier) VALUES (?, ?, ?, ?)').run(uuid(), req.userId, id, tier)
  }

  // Log activity
  const product = db.prepare('SELECT name FROM products WHERE id = ?').get(id) as { name: string }
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'rating', id, product.name, JSON.stringify({ tier })
  )

  const newTier = computeTier(id)
  res.json({ success: true, community_tier: newTier })
})

// POST /api/products/:id/favorite
router.post('/:id/favorite', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?').get(req.userId, id)
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?').run(req.userId, id)
    res.json({ is_favorite: false })
  } else {
    db.prepare('INSERT INTO favorites (user_id, product_id) VALUES (?, ?)').run(req.userId, id)
    res.json({ is_favorite: true })
  }
})

// POST /api/products/:id/reviews
router.post('/:id/reviews', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const { tier, text, photo_url } = req.body
  if (!['S', 'A', 'B', 'C', 'D', 'F'].includes(tier) || !text?.trim()) {
    res.status(400).json({ error: 'Valid tier and review text required' })
    return
  }

  const reviewId = uuid()
  db.prepare('INSERT INTO reviews (id, user_id, product_id, tier, text, photo_url) VALUES (?, ?, ?, ?, ?, ?)').run(
    reviewId, req.userId, id, tier, text.trim(), photo_url || ''
  )

  // Log activity
  const product = db.prepare('SELECT name FROM products WHERE id = ?').get(id) as { name: string }
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'review', id, product.name, JSON.stringify({ tier })
  )

  res.status(201).json({ id: reviewId })
})

// POST /api/products/:id/try — Mark as tried
router.post('/:id/try', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const { photo_url, notes } = req.body as { photo_url?: string; notes?: string }

  if (notes && notes.length > 280) {
    res.status(400).json({ error: 'Notes must be 280 characters or less' })
    return
  }

  const product = db.prepare(`
    SELECT p.name, p.brand_id, b.name as brand_name
    FROM products p JOIN brands b ON p.brand_id = b.id
    WHERE p.id = ?
  `).get(id) as { name: string; brand_id: string; brand_name: string } | undefined

  if (!product) {
    res.status(404).json({ error: 'Product not found' })
    return
  }

  const tryId = uuid()
  db.prepare(`
    INSERT INTO tries (id, user_id, product_id, photo_url, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(tryId, req.userId, id, photo_url || '', notes || '')

  // Log activity
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'try', id, product.name,
    JSON.stringify({ brand_id: product.brand_id, brand_name: product.brand_name, photo_url: photo_url || '', notes: notes || '' })
  )

  const tryCount = (db.prepare('SELECT COUNT(*) as count FROM tries WHERE product_id = ?').get(id) as { count: number }).count

  res.status(201).json({ id: tryId, try_count: tryCount })
})

// POST /api/products — Create a new product
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { name, brand_id, category_id, subcategory, price_range, description, image_url, barcode, size } = req.body as {
    name?: string; brand_id?: string; category_id?: string; subcategory?: string
    price_range?: string; description?: string; image_url?: string; barcode?: string; size?: string
  }

  if (!name || name.length < 2 || name.length > 100) {
    res.status(400).json({ error: 'Name must be 2-100 characters' })
    return
  }
  if (!brand_id) {
    res.status(400).json({ error: 'brand_id is required' })
    return
  }
  if (!category_id) {
    res.status(400).json({ error: 'category_id is required' })
    return
  }

  const brand = db.prepare('SELECT id, name FROM brands WHERE id = ?').get(brand_id) as { id: string; name: string } | undefined
  if (!brand) {
    res.status(404).json({ error: 'Brand not found' })
    return
  }

  const cat = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(category_id) as { id: string; name: string } | undefined
  if (!cat) {
    res.status(404).json({ error: 'Category not found' })
    return
  }

  const productId = uuid()

  db.prepare(`
    INSERT INTO products (id, name, image_url, brand_id, category_id, subcategory, description, barcode, price_range, size, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(productId, name, image_url || '', brand_id, category_id, subcategory || '', description || '', barcode || '', price_range || '', size || '', req.userId)

  // Insert into FTS
  try {
    const maxRowid = (db.prepare('SELECT MAX(rowid) as m FROM products_fts').get() as { m: number | null })?.m ?? 0
    db.prepare('INSERT INTO products_fts(rowid, name, brand_name, category, description) VALUES (?, ?, ?, ?, ?)').run(
      maxRowid + 1, name, brand.name, cat.name, description || ''
    )
  } catch { /* FTS insert failure is non-critical */ }

  res.status(201).json({ id: productId, name })
})

// PUT /api/products/:id — Edit a user-created product (creator only)
router.put('/:id', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const product = db.prepare('SELECT created_by FROM products WHERE id = ?').get(id) as { created_by: string | null } | undefined
  if (!product) {
    res.status(404).json({ error: 'Product not found' })
    return
  }
  if (product.created_by !== req.userId) {
    res.status(403).json({ error: 'Only the creator can edit this product' })
    return
  }

  const { name, price_range, description, image_url, subcategory, barcode, size } = req.body
  const updates: string[] = []
  const params: unknown[] = []

  if (name !== undefined) { updates.push('name = ?'); params.push(name) }
  if (price_range !== undefined) { updates.push('price_range = ?'); params.push(price_range) }
  if (description !== undefined) { updates.push('description = ?'); params.push(description) }
  if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url) }
  if (subcategory !== undefined) { updates.push('subcategory = ?'); params.push(subcategory) }
  if (barcode !== undefined) { updates.push('barcode = ?'); params.push(barcode) }
  if (size !== undefined) { updates.push('size = ?'); params.push(size) }

  if (updates.length > 0) {
    params.push(id)
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  res.json({ success: true })
})

// ---- Product Labels ----

// GET /api/products/:id/labels
router.get('/:id/labels', optionalAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const labels = db.prepare(`
    SELECT label, COUNT(*) as count
    FROM product_labels WHERE product_id = ?
    GROUP BY label ORDER BY count DESC
  `).all(id) as { label: string; count: number }[]

  let userLabels: string[] = []
  if (req.userId) {
    const rows = db.prepare('SELECT label FROM product_labels WHERE user_id = ? AND product_id = ?').all(req.userId, id) as { label: string }[]
    userLabels = rows.map(r => r.label)
  }

  res.json({ labels, user_labels: userLabels, valid_labels: VALID_LABELS })
})

// POST /api/products/:id/labels — toggle a label on/off
router.post('/:id/labels', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const { label } = req.body

  if (!label || !VALID_LABELS.includes(label)) {
    res.status(400).json({ error: `Invalid label. Must be one of: ${VALID_LABELS.join(', ')}` })
    return
  }

  const existing = db.prepare('SELECT id FROM product_labels WHERE user_id = ? AND product_id = ? AND label = ?').get(req.userId, id, label) as { id: string } | undefined
  if (existing) {
    db.prepare('DELETE FROM product_labels WHERE id = ?').run(existing.id)
    res.json({ added: false, label })
  } else {
    db.prepare('INSERT INTO product_labels (id, user_id, product_id, label) VALUES (?, ?, ?, ?)').run(uuid(), req.userId, id, label)
    res.json({ added: true, label })
  }
})

export default router
