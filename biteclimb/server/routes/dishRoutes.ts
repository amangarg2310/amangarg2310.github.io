import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

function computeTier(dishId: string): TierType {
  const tierWeights: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
  const ratings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(dishId) as { tier: TierType; count: number }[]
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

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

// ── Statistical Ranking Endpoints (must come BEFORE /:id) ────────────────────

interface DishRanking {
  id: string
  name: string
  image_url: string
  restaurant_id: string
  restaurant_name: string
  cuisine: string
  price: string
  tier: TierType
  labels: { label: string; count: number }[]
  bayesian_score: number
  observed_score: number
  composite_score: number
  rating_count: number
  elo_score: number
  matches_played: number
  cuisine_rank: number
  worth_it_pct: number
}

// GET /api/dishes/top-by-cuisine
// Returns Bayesian+ELO composite ranked dishes per cuisine.
router.get('/top-by-cuisine', optionalAuth, (req: AuthRequest, res) => {
  const { cuisine } = req.query

  // Fetch all dishes (optionally filtered by cuisine) with restaurant info
  let dishQuery = `
    SELECT d.id, d.name, d.image_url, d.restaurant_id, d.cuisine, d.price,
      r.name as restaurant_name
    FROM dishes d
    JOIN restaurants r ON d.restaurant_id = r.id
  `
  const params: unknown[] = []
  if (cuisine && typeof cuisine === 'string' && cuisine !== 'All') {
    dishQuery += ' WHERE d.cuisine = ?'
    params.push(cuisine)
  }

  const allDishes = db.prepare(dishQuery).all(...params) as {
    id: string
    name: string
    image_url: string
    restaurant_id: string
    cuisine: string
    price: string
    restaurant_name: string
  }[]

  // Group dishes by cuisine
  const byCuisine: Record<string, typeof allDishes> = {}
  for (const dish of allDishes) {
    if (!byCuisine[dish.cuisine]) byCuisine[dish.cuisine] = []
    byCuisine[dish.cuisine].push(dish)
  }

  // Process each cuisine group
  const resultsByCuisine: Record<string, DishRanking[]> = {}

  for (const [cuisineName, dishes] of Object.entries(byCuisine)) {
    // Step 1: Gather rating distributions for all dishes in this cuisine
    type EnrichedDish = typeof dishes[0] & {
      observedScore: number
      ratingCount: number
      ratingDist: { tier: TierType; count: number }[]
    }

    const enrichedDishes: EnrichedDish[] = dishes.map(d => {
      const ratingDist = db.prepare(
        'SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier'
      ).all(d.id) as { tier: TierType; count: number }[]
      const { score, count } = computeObservedScore(ratingDist)
      return { ...d, observedScore: score, ratingCount: count, ratingDist }
    })

    // Step 2: Compute global mean for this cuisine
    const ratedDishes = enrichedDishes.filter(d => d.ratingCount > 0)
    const globalMean = ratedDishes.length > 0
      ? ratedDishes.reduce((sum, d) => sum + d.observedScore, 0) / ratedDishes.length
      : 3.5

    // Step 3: Apply Bayesian scoring, fetch ELO data, compute composite score
    const scoredDishes: DishRanking[] = enrichedDishes.map(d => {
      const bScore = bayesianScore(d.observedScore, d.ratingCount, globalMean)
      const tier = d.ratingCount === 0 ? 'C' : scoreToBadgeTier(d.observedScore)

      // Step 4: Get ELO data (default 1500 / 0 if not in dish_elo)
      const eloRow = db.prepare(
        'SELECT elo_score, matches_played FROM dish_elo WHERE dish_id = ?'
      ).get(d.id) as { elo_score: number; matches_played: number } | undefined
      const eloScore = eloRow?.elo_score ?? 1500
      const matchesPlayed = eloRow?.matches_played ?? 0

      // Step 5: Composite score
      // elo_weight = min(matches_played / 20, 0.4)
      // normalized_elo maps 1000-2000 ELO -> 1-6 tier range
      // normalized_elo = ((elo_score - 1000) / 1000) * 5 + 1
      const eloWeight = Math.min(matchesPlayed / 20, 0.4)
      const normalizedElo = ((eloScore - 1000) / 1000) * 5 + 1
      const compositeScore = (1 - eloWeight) * bScore + eloWeight * normalizedElo

      // Top 2 labels
      const labels = db.prepare(`
        SELECT label, COUNT(*) as count
        FROM dish_labels WHERE dish_id = ?
        GROUP BY label ORDER BY count DESC LIMIT 2
      `).all(d.id) as { label: string; count: number }[]

      // worth_it_pct: % of S + A ratings
      const ratingMap: Record<string, number> = {}
      for (const dr of d.ratingDist) ratingMap[dr.tier] = dr.count
      const worthItCount = (ratingMap['S'] || 0) + (ratingMap['A'] || 0)
      const worth_it_pct = d.ratingCount > 0 ? Math.round((worthItCount / d.ratingCount) * 100) : 0

      return {
        id: d.id,
        name: d.name,
        image_url: d.image_url,
        restaurant_id: d.restaurant_id,
        restaurant_name: d.restaurant_name,
        cuisine: cuisineName,
        price: d.price,
        tier: tier as TierType,
        labels,
        bayesian_score: Math.round(bScore * 1000) / 1000,
        observed_score: Math.round(d.observedScore * 1000) / 1000,
        composite_score: Math.round(compositeScore * 1000) / 1000,
        rating_count: d.ratingCount,
        elo_score: Math.round(eloScore * 10) / 10,
        matches_played: matchesPlayed,
        cuisine_rank: 0, // assigned after sort
        worth_it_pct,
      }
    })

    // Step 6: Sort by composite score descending, take top 20
    scoredDishes.sort((a, b) => b.composite_score - a.composite_score)
    const top20 = scoredDishes.slice(0, 20)

    // Step 7: Assign cuisine_rank
    top20.forEach((d, i) => { d.cuisine_rank = i + 1 })

    resultsByCuisine[cuisineName] = top20
  }

  // Return flat array if cuisine filter applied, grouped record otherwise
  if (cuisine && typeof cuisine === 'string' && cuisine !== 'All') {
    const cuisineKey = Object.keys(resultsByCuisine)[0]
    res.json(cuisineKey ? resultsByCuisine[cuisineKey] : [])
  } else {
    res.json(resultsByCuisine)
  }
})

// GET /api/dishes/matchup
// Returns two dishes for ELO head-to-head comparison. Requires auth.
router.get('/matchup', requireAuth, (req: AuthRequest, res) => {
  const { cuisine } = req.query
  if (!cuisine || typeof cuisine !== 'string') {
    res.status(400).json({ error: 'cuisine query parameter is required' })
    return
  }

  // Step 1: Get all dishes for this cuisine
  const dishes = db.prepare(`
    SELECT d.id, d.name, d.image_url, d.price, d.restaurant_id,
      r.name as restaurant_name
    FROM dishes d
    JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.cuisine = ?
  `).all(cuisine) as {
    id: string
    name: string
    image_url: string
    price: string
    restaurant_id: string
    restaurant_name: string
  }[]

  if (dishes.length < 2) {
    res.status(404).json({ error: 'Not enough dishes in this cuisine for a matchup' })
    return
  }

  // Step 2: Lazily create ELO rows for all dishes in this cuisine (INSERT OR IGNORE)
  const insertElo = db.prepare('INSERT OR IGNORE INTO dish_elo (dish_id) VALUES (?)')
  for (const d of dishes) {
    insertElo.run(d.id)
  }

  // Step 3: Fetch ELO data for all dishes in this cuisine
  const eloMap: Record<string, { elo_score: number; matches_played: number }> = {}
  const eloRows = db.prepare(
    `SELECT dish_id, elo_score, matches_played FROM dish_elo WHERE dish_id IN (${dishes.map(() => '?').join(',')})`
  ).all(...dishes.map(d => d.id)) as { dish_id: string; elo_score: number; matches_played: number }[]
  for (const row of eloRows) {
    eloMap[row.dish_id] = { elo_score: row.elo_score, matches_played: row.matches_played }
  }

  // Step 4: Get recently seen matchups for this user (last 50), stored as canonical sorted pair
  const seenPairs = new Set<string>()
  const seenMatches = db.prepare(`
    SELECT dish_a_id, dish_b_id FROM elo_matches
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.userId) as { dish_a_id: string; dish_b_id: string }[]
  for (const m of seenMatches) {
    seenPairs.add([m.dish_a_id, m.dish_b_id].sort().join('|'))
  }

  // Step 5: Sort dishes by matches_played ascending (fewest matches first)
  const sortedDishes = [...dishes].sort((a, b) => {
    const aMatches = eloMap[a.id]?.matches_played ?? 0
    const bMatches = eloMap[b.id]?.matches_played ?? 0
    return aMatches - bMatches
  })

  // Step 6: Pick two dishes — prefer unseen pairs with ELO within 200 points
  let selectedA: typeof dishes[0] | null = null
  let selectedB: typeof dishes[0] | null = null

  // Primary pass: unseen + similar ELO (within 200)
  outerClose:
  for (let i = 0; i < sortedDishes.length; i++) {
    for (let j = i + 1; j < sortedDishes.length; j++) {
      const a = sortedDishes[i]
      const b = sortedDishes[j]
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

  // Fallback: any unseen pair regardless of ELO distance
  if (!selectedA || !selectedB) {
    outerAny:
    for (let i = 0; i < sortedDishes.length; i++) {
      for (let j = i + 1; j < sortedDishes.length; j++) {
        const a = sortedDishes[i]
        const b = sortedDishes[j]
        if (!seenPairs.has([a.id, b.id].sort().join('|'))) {
          selectedA = a
          selectedB = b
          break outerAny
        }
      }
    }
  }

  // Final fallback: just pick the two with fewest matches (even if seen)
  if (!selectedA || !selectedB) {
    selectedA = sortedDishes[0]
    selectedB = sortedDishes[1]
  }

  // Step 7: Build response with tier info for each dish
  const buildDishResponse = (d: typeof dishes[0]) => {
    const elo = eloMap[d.id] ?? { elo_score: 1500, matches_played: 0 }
    return {
      id: d.id,
      name: d.name,
      image_url: d.image_url,
      restaurant_name: d.restaurant_name,
      price: d.price,
      tier: computeTier(d.id),
      elo_score: Math.round(elo.elo_score * 10) / 10,
      matches_played: elo.matches_played,
    }
  }

  res.json({
    dish_a: buildDishResponse(selectedA),
    dish_b: buildDishResponse(selectedB),
  })
})

// POST /api/dishes/matchup
// Records the result of an ELO matchup and updates scores. Requires auth.
router.post('/matchup', requireAuth, (req: AuthRequest, res) => {
  const { dish_a_id, dish_b_id, winner_id, cuisine } = req.body as {
    dish_a_id: string
    dish_b_id: string
    winner_id: string | null
    cuisine: string
  }

  if (!dish_a_id || !dish_b_id || !cuisine) {
    res.status(400).json({ error: 'dish_a_id, dish_b_id, and cuisine are required' })
    return
  }

  // Validate winner_id if provided
  if (winner_id !== null && winner_id !== dish_a_id && winner_id !== dish_b_id) {
    res.status(400).json({ error: 'winner_id must be dish_a_id, dish_b_id, or null (skip)' })
    return
  }

  // Step 1: Log the match to elo_matches
  db.prepare(`
    INSERT INTO elo_matches (id, user_id, dish_a_id, dish_b_id, winner_id, cuisine)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), req.userId, dish_a_id, dish_b_id, winner_id, cuisine)

  // Step 2: If skipped (null winner), return without updating ELO
  if (winner_id === null) {
    res.json({ success: true, dish_a_elo: null, dish_b_elo: null })
    return
  }

  // Step 3: Ensure ELO rows exist for both dishes (lazy creation)
  db.prepare('INSERT OR IGNORE INTO dish_elo (dish_id) VALUES (?)').run(dish_a_id)
  db.prepare('INSERT OR IGNORE INTO dish_elo (dish_id) VALUES (?)').run(dish_b_id)

  // Fetch current ELO scores and matches_played
  const eloA = db.prepare('SELECT elo_score, matches_played FROM dish_elo WHERE dish_id = ?').get(dish_a_id) as { elo_score: number; matches_played: number }
  const eloB = db.prepare('SELECT elo_score, matches_played FROM dish_elo WHERE dish_id = ?').get(dish_b_id) as { elo_score: number; matches_played: number }

  const eloScoreA = eloA.elo_score
  const eloScoreB = eloB.elo_score
  const matchesA = eloA.matches_played
  const matchesB = eloB.matches_played

  // Dynamic K-factor: K=40 if <10 matches, K=24 if <30 matches, K=16 otherwise
  const kFactor = (matches: number): number => {
    if (matches < 10) return 40
    if (matches < 30) return 24
    return 16
  }
  const kA = kFactor(matchesA)
  const kB = kFactor(matchesB)

  // Expected scores (standard ELO formula)
  const expectedA = 1 / (1 + Math.pow(10, (eloScoreB - eloScoreA) / 400))
  const outcomeA = winner_id === dish_a_id ? 1 : 0

  // New ELO scores
  const newEloA = eloScoreA + kA * (outcomeA - expectedA)
  const newEloB = eloScoreB + kB * ((1 - outcomeA) - (1 - expectedA))

  // Update dish_elo for both (increment matches_played)
  db.prepare(`
    UPDATE dish_elo
    SET elo_score = ?, matches_played = matches_played + 1, updated_at = datetime('now')
    WHERE dish_id = ?
  `).run(newEloA, dish_a_id)
  db.prepare(`
    UPDATE dish_elo
    SET elo_score = ?, matches_played = matches_played + 1, updated_at = datetime('now')
    WHERE dish_id = ?
  `).run(newEloB, dish_b_id)

  res.json({
    success: true,
    dish_a_elo: Math.round(newEloA * 10) / 10,
    dish_b_elo: Math.round(newEloB * 10) / 10,
  })
})

// GET /api/dishes/elo-rankings
// Returns dishes with >=3 ELO matches, ranked by elo_score, for a cuisine.
router.get('/elo-rankings', optionalAuth, (req: AuthRequest, res) => {
  const { cuisine } = req.query
  if (!cuisine || typeof cuisine !== 'string') {
    res.status(400).json({ error: 'cuisine query parameter is required' })
    return
  }

  // Fetch dishes in this cuisine with at least 3 ELO matches, sorted by elo_score desc
  const rows = db.prepare(`
    SELECT
      de.elo_score,
      de.matches_played,
      d.id as dish_id,
      d.name,
      d.image_url,
      d.price,
      d.restaurant_id,
      r.name as restaurant_name
    FROM dish_elo de
    JOIN dishes d ON de.dish_id = d.id
    JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.cuisine = ?
      AND de.matches_played >= 3
    ORDER BY de.elo_score DESC
  `).all(cuisine) as {
    elo_score: number
    matches_played: number
    dish_id: string
    name: string
    image_url: string
    price: string
    restaurant_id: string
    restaurant_name: string
  }[]

  const ranked = rows.map((row, i) => ({
    cuisine_rank: i + 1,
    dish_id: row.dish_id,
    name: row.name,
    image_url: row.image_url,
    restaurant_name: row.restaurant_name,
    price: row.price,
    tier: computeTier(row.dish_id),
    elo_score: Math.round(row.elo_score * 10) / 10,
    matches_played: row.matches_played,
  }))

  res.json(ranked)
})

// ── Existing parameterized routes (must come AFTER static paths above) ────────

// GET /api/dishes
router.get('/', optionalAuth, (req: AuthRequest, res) => {
  const { cuisine, search, sort, lat, lng, radius } = req.query

  let dishIds: string[] | null = null

  // Full-text search
  if (search && typeof search === 'string' && search.trim()) {
    const ftsResults = db.prepare("SELECT rowid FROM dishes_fts WHERE dishes_fts MATCH ? ORDER BY rank LIMIT 50").all(search + '*') as { rowid: number }[]
    // Map FTS rowids back to dish ids
    const allDishes = db.prepare('SELECT id FROM dishes').all() as { id: string }[]
    dishIds = ftsResults.map(r => allDishes[r.rowid - 1]?.id).filter(Boolean)
  }

  let query = `
    SELECT d.*, r.name as restaurant_name, r.neighborhood,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rating_count,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id AND created_at > datetime('now', '-7 days')) as week_ratings,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id AND created_at > datetime('now', '-1 day')) as today_ratings
    FROM dishes d
    JOIN restaurants r ON d.restaurant_id = r.id
  `
  const params: unknown[] = []
  const conditions: string[] = []

  if (dishIds !== null) {
    if (dishIds.length === 0) {
      res.json([])
      return
    }
    conditions.push(`d.id IN (${dishIds.map(() => '?').join(',')})`)
    params.push(...dishIds)
  }

  if (cuisine && typeof cuisine === 'string' && cuisine !== 'All') {
    conditions.push('d.cuisine = ?')
    params.push(cuisine)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }

  if (sort === 'trending') {
    query += ' ORDER BY week_ratings DESC, rating_count DESC'
  } else if (sort === 'top') {
    query += ' ORDER BY rating_count DESC'
  } else {
    query += ' ORDER BY rating_count DESC'
  }

  const rawDishes = db.prepare(query).all(...params) as Record<string, unknown>[]

  // Enrich with computed tier, images, distance, user's rating, favorite status
  const enriched = rawDishes.map(d => {
    const tier = computeTier(d.id as string)
    const images = db.prepare('SELECT image_url FROM dish_images WHERE dish_id = ? ORDER BY sort_order').all(d.id) as { image_url: string }[]
    const ratingDist = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(d.id) as { tier: string; count: number }[]
    const ratings: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const r of ratingDist) ratings[r.tier] = r.count

    let userRating: string | null = null
    let isFavorite = false
    if (req.userId) {
      const ur = db.prepare('SELECT tier FROM ratings WHERE user_id = ? AND dish_id = ?').get(req.userId, d.id) as { tier: string } | undefined
      userRating = ur?.tier || null
      const fav = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND dish_id = ?').get(req.userId, d.id)
      isFavorite = !!fav
    }

    let distance: number | null = null
    if (lat && lng) {
      distance = haversineDistance(Number(lat), Number(lng), d.lat as number, d.lng as number)
    }

    // Dish labels
    const labelRows = db.prepare(`
      SELECT label, COUNT(*) as count
      FROM dish_labels WHERE dish_id = ?
      GROUP BY label ORDER BY count DESC LIMIT 3
    `).all(d.id) as { label: string; count: number }[]

    return {
      id: d.id,
      name: d.name,
      image_url: d.image_url,
      images: images.map(i => i.image_url),
      tier,
      location: d.location,
      restaurant: d.restaurant_name,
      restaurant_id: d.restaurant_id,
      rating_count: d.rating_count,
      cuisine: d.cuisine,
      description: d.description,
      price: d.price,
      ratings,
      trending_delta: d.week_ratings,
      today_ratings: d.today_ratings,
      user_rating: userRating,
      is_favorite: isFavorite,
      distance,
      lat: d.lat,
      lng: d.lng,
      labels: labelRows,
    }
  })

  // Sort by distance if geo provided
  if (lat && lng && sort === 'nearby') {
    enriched.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }

  // Filter by radius
  if (radius && lat && lng) {
    const maxDist = Number(radius)
    res.json(enriched.filter(d => (d.distance ?? Infinity) <= maxDist))
    return
  }

  res.json(enriched)
})

// POST /api/reviews/:id/helpful
// NOTE: This must come before /:id to avoid being captured by it.
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

// GET /api/dishes/:id
router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const d = db.prepare(`
    SELECT d.*, r.name as restaurant_name, r.neighborhood
    FROM dishes d JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!d) {
    res.status(404).json({ error: 'Dish not found' })
    return
  }

  const tier = computeTier(id)
  const images = db.prepare('SELECT image_url FROM dish_images WHERE dish_id = ? ORDER BY sort_order').all(id) as { image_url: string }[]
  const ratingDist = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE dish_id = ? GROUP BY tier').all(id) as { tier: string; count: number }[]
  const ratingCount = ratingDist.reduce((sum, r) => sum + r.count, 0)
  const ratings: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const r of ratingDist) ratings[r.tier] = r.count

  const todayRatings = db.prepare("SELECT COUNT(*) as count FROM ratings WHERE dish_id = ? AND created_at > datetime('now', '-1 day')").get(id) as { count: number }
  const weekRatings = db.prepare("SELECT COUNT(*) as count FROM ratings WHERE dish_id = ? AND created_at > datetime('now', '-7 days')").get(id) as { count: number }

  // Reviews
  const reviews = db.prepare(`
    SELECT rv.id, rv.tier, rv.text, rv.created_at,
      u.id as user_id, u.username, u.avatar,
      (SELECT COUNT(*) FROM review_helpful WHERE review_id = rv.id) as helpful
    FROM reviews rv JOIN users u ON rv.user_id = u.id
    WHERE rv.dish_id = ?
    ORDER BY rv.created_at DESC
  `).all(id) as Record<string, unknown>[]

  // Similar dishes
  const similar = db.prepare(`
    SELECT d.id, d.name, d.image_url, d.location, d.cuisine,
      r.name as restaurant_name,
      (SELECT COUNT(*) FROM ratings WHERE dish_id = d.id) as rating_count
    FROM dishes d JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id != ? AND (d.cuisine = ? OR d.restaurant_id = ?)
    LIMIT 4
  `).all(id, d.cuisine, d.restaurant_id) as Record<string, unknown>[]

  const similarEnriched = similar.map(s => ({
    ...s,
    restaurant: s.restaurant_name,
    tier: computeTier(s.id as string),
  }))

  let userRating: string | null = null
  let isFavorite = false
  let userLabels: string[] = []
  if (req.userId) {
    const ur = db.prepare('SELECT tier FROM ratings WHERE user_id = ? AND dish_id = ?').get(req.userId, id) as { tier: string } | undefined
    userRating = ur?.tier || null
    isFavorite = !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND dish_id = ?').get(req.userId, id)
    const ulRows = db.prepare('SELECT label FROM dish_labels WHERE user_id = ? AND dish_id = ?').all(req.userId, id) as { label: string }[]
    userLabels = ulRows.map(r => r.label)
  }

  // Dish labels (crowdsourced)
  const labelRows = db.prepare(`
    SELECT label, COUNT(*) as count
    FROM dish_labels WHERE dish_id = ?
    GROUP BY label ORDER BY count DESC
  `).all(id) as { label: string; count: number }[]

  // ELO data
  const eloRow = db.prepare('SELECT elo_score, matches_played FROM dish_elo WHERE dish_id = ?').get(id) as { elo_score: number; matches_played: number } | undefined
  const eloScore = eloRow?.elo_score ?? null
  const matchesPlayed = eloRow?.matches_played ?? 0

  // Cuisine ELO rank (among dishes with ≥3 matches)
  let cuisineEloRank: number | null = null
  let cuisineEloTotal: number | null = null
  if (eloScore !== null && matchesPlayed >= 3) {
    const rankedDishes = db.prepare(`
      SELECT de.dish_id FROM dish_elo de
      JOIN dishes d2 ON de.dish_id = d2.id
      WHERE d2.cuisine = ? AND de.matches_played >= 3
      ORDER BY de.elo_score DESC
    `).all(d.cuisine) as { dish_id: string }[]
    cuisineEloTotal = rankedDishes.length
    const rankIdx = rankedDishes.findIndex(r => r.dish_id === id)
    cuisineEloRank = rankIdx >= 0 ? rankIdx + 1 : null
  }

  res.json({
    id: d.id,
    name: d.name,
    image_url: d.image_url,
    images: images.map(i => i.image_url),
    tier,
    location: d.location,
    restaurant: d.restaurant_name,
    restaurant_id: d.restaurant_id,
    rating_count: ratingCount,
    cuisine: d.cuisine,
    description: d.description,
    price: d.price,
    ratings,
    trending_delta: weekRatings.count,
    today_ratings: todayRatings.count,
    reviews,
    similar: similarEnriched,
    user_rating: userRating,
    is_favorite: isFavorite,
    user_labels: userLabels,
    labels: labelRows,
    lat: d.lat,
    lng: d.lng,
    elo_score: eloScore,
    matches_played: matchesPlayed,
    cuisine_elo_rank: cuisineEloRank,
    cuisine_elo_total: cuisineEloTotal,
  })
})

// POST /api/dishes/:id/rate
router.post('/:id/rate', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const { tier } = req.body
  if (!['S', 'A', 'B', 'C', 'D', 'F'].includes(tier)) {
    res.status(400).json({ error: 'Invalid tier' })
    return
  }

  // Upsert rating
  const existing = db.prepare('SELECT id FROM ratings WHERE user_id = ? AND dish_id = ?').get(req.userId, id) as { id: string } | undefined
  if (existing) {
    db.prepare('UPDATE ratings SET tier = ?, created_at = datetime(\'now\') WHERE id = ?').run(tier, existing.id)
  } else {
    db.prepare('INSERT INTO ratings (id, user_id, dish_id, tier) VALUES (?, ?, ?, ?)').run(uuid(), req.userId, id, tier)
  }

  // Log activity
  const dish = db.prepare('SELECT name FROM dishes WHERE id = ?').get(id) as { name: string }
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'rating', id, dish.name, JSON.stringify({ tier })
  )

  const newTier = computeTier(id)
  res.json({ success: true, community_tier: newTier })
})

// POST /api/dishes/:id/favorite
router.post('/:id/favorite', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND dish_id = ?').get(req.userId, id)
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND dish_id = ?').run(req.userId, id)
    res.json({ is_favorite: false })
  } else {
    db.prepare('INSERT INTO favorites (user_id, dish_id) VALUES (?, ?)').run(req.userId, id)
    res.json({ is_favorite: true })
  }
})

// POST /api/dishes/:id/reviews
router.post('/:id/reviews', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const { tier, text } = req.body
  if (!['S', 'A', 'B', 'C', 'D', 'F'].includes(tier) || !text?.trim()) {
    res.status(400).json({ error: 'Valid tier and review text required' })
    return
  }

  const reviewId = uuid()
  db.prepare('INSERT INTO reviews (id, user_id, dish_id, tier, text) VALUES (?, ?, ?, ?, ?)').run(reviewId, req.userId, id, tier, text.trim())

  // Log activity
  const dish = db.prepare('SELECT name FROM dishes WHERE id = ?').get(id) as { name: string }
  db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuid(), req.userId, 'review', id, dish.name, JSON.stringify({ tier })
  )

  res.status(201).json({ id: reviewId })
})

// ---- Dish Labels ----
const VALID_LABELS = [
  'Most Popular',
  'Best Tasting',
  'Known For',
  'Best Looking',
  'Spiciest',
  'Best Value',
  'Most Unique',
  'Biggest Portion',
  'Must Try',
]

// GET /api/dishes/:id/labels
router.get('/:id/labels', optionalAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const labels = db.prepare(`
    SELECT label, COUNT(*) as count
    FROM dish_labels WHERE dish_id = ?
    GROUP BY label ORDER BY count DESC
  `).all(id) as { label: string; count: number }[]

  let userLabels: string[] = []
  if (req.userId) {
    const rows = db.prepare('SELECT label FROM dish_labels WHERE user_id = ? AND dish_id = ?').all(req.userId, id) as { label: string }[]
    userLabels = rows.map(r => r.label)
  }

  res.json({ labels, user_labels: userLabels, valid_labels: VALID_LABELS })
})

// POST /api/dishes/:id/labels — toggle a label on/off
router.post('/:id/labels', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const { label } = req.body

  if (!label || !VALID_LABELS.includes(label)) {
    res.status(400).json({ error: `Invalid label. Must be one of: ${VALID_LABELS.join(', ')}` })
    return
  }

  const existing = db.prepare('SELECT id FROM dish_labels WHERE user_id = ? AND dish_id = ? AND label = ?').get(req.userId, id, label) as { id: string } | undefined
  if (existing) {
    db.prepare('DELETE FROM dish_labels WHERE id = ?').run(existing.id)
    res.json({ added: false, label })
  } else {
    db.prepare('INSERT INTO dish_labels (id, user_id, dish_id, label) VALUES (?, ?, ?, ?)').run(uuid(), req.userId, id, label)
    res.json({ added: true, label })
  }
})

export default router
