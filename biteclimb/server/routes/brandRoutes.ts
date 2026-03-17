import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

// ── Shared utilities ──────────────────────────────────────────────────────────

const TIER_WEIGHTS: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }
const BAYESIAN_M = 20

function computeObservedScore(ratings: { tier: TierType; count: number }[]): { score: number; count: number } {
  let totalWeight = 0
  let totalCount = 0
  for (const r of ratings) {
    totalWeight += TIER_WEIGHTS[r.tier] * r.count
    totalCount += r.count
  }
  return { score: totalCount > 0 ? totalWeight / totalCount : 0, count: totalCount }
}

function bayesianScore(observedScore: number, n: number, globalMean: number, m = BAYESIAN_M): number {
  if (n === 0) return globalMean
  return (n / (n + m)) * observedScore + (m / (n + m)) * globalMean
}

function scoreToBadgeTier(score: number): TierType {
  if (score >= 5.5) return 'S'
  if (score >= 4.5) return 'A'
  if (score >= 3.5) return 'B'
  if (score >= 2.5) return 'C'
  if (score >= 1.5) return 'D'
  return 'F'
}

/** Compute community tier badge for a brand from all its product ratings. */
function computeBrandTier(brandId: string): TierType {
  const ratings = db.prepare(`
    SELECT r.tier, COUNT(*) as count
    FROM ratings r JOIN products p ON r.product_id = p.id
    WHERE p.brand_id = ?
    GROUP BY r.tier
  `).all(brandId) as { tier: TierType; count: number }[]
  const { score, count } = computeObservedScore(ratings)
  return count === 0 ? 'C' : scoreToBadgeTier(score)
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/brands
router.get('/', optionalAuth, (req: AuthRequest, res) => {
  const { category } = req.query

  let query = `
    SELECT b.*,
      (SELECT COUNT(*) FROM ratings rt JOIN products p ON rt.product_id = p.id WHERE p.brand_id = b.id) as rating_count
    FROM brands b
  `
  const params: unknown[] = []

  if (category && typeof category === 'string') {
    query = `
      SELECT DISTINCT b.*,
        (SELECT COUNT(*) FROM ratings rt JOIN products p ON rt.product_id = p.id WHERE p.brand_id = b.id) as rating_count
      FROM brands b
      JOIN products p ON p.brand_id = b.id
      WHERE p.category_id = ?
    `
    params.push(category)
  }

  query += ' ORDER BY rating_count DESC'

  const brands = db.prepare(query).all(...params) as Record<string, unknown>[]

  const enriched = brands.map(b => ({
    id: b.id,
    name: b.name,
    logo_url: b.logo_url,
    description: b.description,
    community_tier: computeBrandTier(b.id as string),
    rating_count: b.rating_count,
  }))

  res.json(enriched)
})

// GET /api/brands/top-by-category
router.get('/top-by-category', optionalAuth, (req: AuthRequest, res) => {
  const { category } = req.query

  // Determine categories to process
  const categoryIds: { id: string; name: string }[] = []
  if (category && typeof category === 'string' && category !== 'All') {
    const cat = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(category) as { id: string; name: string } | undefined
    if (cat) categoryIds.push(cat)
  } else {
    const rows = db.prepare('SELECT id, name FROM categories ORDER BY sort_order').all() as { id: string; name: string }[]
    categoryIds.push(...rows)
  }

  const results: Record<string, unknown[]> = {}

  for (const cat of categoryIds) {
    // Fetch all brands that have products in this category
    const brands = db.prepare(`
      SELECT DISTINCT b.*,
        (SELECT COUNT(*) FROM ratings rt JOIN products p ON rt.product_id = p.id WHERE p.brand_id = b.id AND p.category_id = ?) as rating_count,
        (SELECT COUNT(*) FROM ratings rt JOIN products p ON rt.product_id = p.id WHERE p.brand_id = b.id AND p.category_id = ? AND rt.created_at > datetime('now', '-7 days')) as recent_ratings
      FROM brands b
      JOIN products p ON p.brand_id = b.id
      WHERE p.category_id = ?
    `).all(cat.id, cat.id, cat.id) as Record<string, unknown>[]

    type ScoredBrand = {
      raw: Record<string, unknown>
      observedScore: number
      ratingCount: number
    }

    const scoredList: ScoredBrand[] = brands.map(b => {
      const ratingRows = db.prepare(`
        SELECT rt.tier, COUNT(*) as count
        FROM ratings rt JOIN products p ON rt.product_id = p.id
        WHERE p.brand_id = ? AND p.category_id = ?
        GROUP BY rt.tier
      `).all(b.id, cat.id) as { tier: TierType; count: number }[]
      const { score, count } = computeObservedScore(ratingRows)
      return { raw: b, observedScore: score, ratingCount: count }
    })

    const ratedInCategory = scoredList.filter(s => s.ratingCount > 0)
    const globalMean = ratedInCategory.length > 0
      ? ratedInCategory.reduce((sum, s) => sum + s.observedScore, 0) / ratedInCategory.length
      : 3.5

    const ranked = scoredList.map(({ raw: b, observedScore, ratingCount }) => {
      const bScore = bayesianScore(observedScore, ratingCount, globalMean)
      const tier = ratingCount === 0 ? 'C' : scoreToBadgeTier(observedScore)

      // Get top 3 products for this brand in this category
      const topProducts = db.prepare(`
        SELECT p.id, p.name, p.image_url, p.price_range,
          (SELECT COUNT(*) FROM ratings WHERE product_id = p.id) as product_rating_count
        FROM products p
        WHERE p.brand_id = ? AND p.category_id = ?
        ORDER BY product_rating_count DESC
        LIMIT 3
      `).all(b.id, cat.id) as Record<string, unknown>[]

      const topProductsEnriched = topProducts.map(p => {
        const pRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(p.id) as { tier: TierType; count: number }[]
        const { score: pScore, count: pCount } = computeObservedScore(pRatings)
        const pTier: TierType = pCount === 0 ? 'C' : scoreToBadgeTier(pScore)

        const labels = db.prepare(`
          SELECT label, COUNT(*) as count
          FROM product_labels WHERE product_id = ?
          GROUP BY label ORDER BY count DESC
        `).all(p.id) as { label: string; count: number }[]

        return { ...p, tier: pTier, labels }
      })

      return {
        id: b.id,
        name: b.name,
        logo_url: b.logo_url,
        description: b.description,
        community_tier: tier as TierType,
        bayesian_score: Math.round(bScore * 1000) / 1000,
        observed_score: Math.round(observedScore * 1000) / 1000,
        rating_count: ratingCount,
        recent_ratings: b.recent_ratings,
        top_products: topProductsEnriched,
        is_newcomer: ratingCount < 10,
        rank: 0,
      }
    })

    ranked.sort((a, b) => b.bayesian_score - a.bayesian_score)
    ranked.forEach((b, i) => { b.rank = i + 1 })

    results[cat.name] = ranked
  }

  res.json(results)
})

// GET /api/brands/trending
router.get('/trending', optionalAuth, (_req: AuthRequest, res) => {
  const allBrands = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM ratings rt JOIN products p ON rt.product_id = p.id WHERE p.brand_id = b.id) as rating_count,
      (SELECT COUNT(*) FROM ratings rt JOIN products p ON rt.product_id = p.id WHERE p.brand_id = b.id AND rt.created_at > datetime('now', '-7 days')) as week_ratings
    FROM brands b
  `).all() as Record<string, unknown>[]

  const withActivity = allBrands
    .filter(b => (b.week_ratings as number) > 0)
    .map(b => ({
      id: b.id,
      name: b.name,
      logo_url: b.logo_url,
      description: b.description,
      community_tier: computeBrandTier(b.id as string),
      rating_count: b.rating_count as number,
      week_ratings: b.week_ratings as number,
    }))
    .sort((a, b) => b.week_ratings - a.week_ratings)
    .slice(0, 10)

  // Add top product for each trending brand
  const enriched = withActivity.map(b => {
    const topProductRow = db.prepare(`
      SELECT p.id, p.name, p.image_url, p.price_range,
        (SELECT COUNT(*) FROM ratings WHERE product_id = p.id) as product_rating_count
      FROM products p
      WHERE p.brand_id = ?
      ORDER BY product_rating_count DESC
      LIMIT 1
    `).get(b.id) as Record<string, unknown> | undefined

    let topProduct: Record<string, unknown> | null = null
    if (topProductRow) {
      const pRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(topProductRow.id) as { tier: TierType; count: number }[]
      const { score: pScore, count: pCount } = computeObservedScore(pRatings)
      const pTier: TierType = pCount === 0 ? 'C' : scoreToBadgeTier(pScore)

      const labels = db.prepare(`
        SELECT label, COUNT(*) as count
        FROM product_labels WHERE product_id = ?
        GROUP BY label ORDER BY count DESC LIMIT 2
      `).all(topProductRow.id) as { label: string; count: number }[]

      topProduct = {
        id: topProductRow.id,
        name: topProductRow.name,
        image_url: topProductRow.image_url,
        tier: pTier,
        labels,
      }
    }

    return { ...b, top_product: topProduct }
  })

  res.json(enriched)
})

// POST /api/brands — Create a new brand
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { name, description, logo_url } = req.body as {
    name?: string; description?: string; logo_url?: string
  }

  if (!name || name.length < 2 || name.length > 100) {
    res.status(400).json({ error: 'Name must be 2-100 characters' })
    return
  }

  const id = uuid()
  db.prepare(`
    INSERT INTO brands (id, name, logo_url, description, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, logo_url || '', description || '', req.userId)

  // Insert into FTS
  try {
    const maxRowid = (db.prepare('SELECT MAX(rowid) as m FROM brands_fts').get() as { m: number | null })?.m ?? 0
    db.prepare('INSERT INTO brands_fts(rowid, name, description) VALUES (?, ?, ?)').run(
      maxRowid + 1, name, description || ''
    )
  } catch { /* FTS insert failure is non-critical */ }

  res.status(201).json({ id, name })
})

// PUT /api/brands/:id — Edit a user-created brand (creator only)
router.put('/:id', requireAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const brand = db.prepare('SELECT created_by FROM brands WHERE id = ?').get(id) as { created_by: string | null } | undefined
  if (!brand) {
    res.status(404).json({ error: 'Brand not found' })
    return
  }
  if (brand.created_by !== req.userId) {
    res.status(403).json({ error: 'Only the creator can edit this brand' })
    return
  }

  const { name, description, logo_url } = req.body
  const updates: string[] = []
  const params: unknown[] = []

  if (name !== undefined) { updates.push('name = ?'); params.push(name) }
  if (description !== undefined) { updates.push('description = ?'); params.push(description) }
  if (logo_url !== undefined) { updates.push('logo_url = ?'); params.push(logo_url) }

  if (updates.length > 0) {
    params.push(id)
    db.prepare(`UPDATE brands SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  res.json({ success: true })
})

// GET /api/brands/:id
router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const id = req.params.id as string
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!brand) {
    res.status(404).json({ error: 'Brand not found' })
    return
  }

  // Fetch all products for this brand with their rating counts
  const products = db.prepare(`
    SELECT p.id, p.name, p.image_url, p.price_range, p.size, p.subcategory,
      p.category_id, c.name as category_name, c.emoji as category_emoji,
      (SELECT COUNT(*) FROM ratings WHERE product_id = p.id) as rating_count
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.brand_id = ?
  `).all(id) as Record<string, unknown>[]

  // Compute the brand-level global mean for Bayesian scoring
  const brandRatingRows = db.prepare(`
    SELECT rt.tier, COUNT(*) as count
    FROM ratings rt
    JOIN products p ON rt.product_id = p.id
    WHERE p.brand_id = ?
    GROUP BY rt.tier
  `).all(id) as { tier: TierType; count: number }[]
  const { score: brandTotal, count: brandCount } = computeObservedScore(brandRatingRows)
  const brandGlobalMean = brandCount > 0 ? brandTotal : 3.5

  // Enrich products with Bayesian score, tier, labels, and worth_it_pct
  const productsEnriched = products.map(p => {
    const labels = db.prepare(`
      SELECT label, COUNT(*) as count
      FROM product_labels WHERE product_id = ?
      GROUP BY label ORDER BY count DESC
    `).all(p.id) as { label: string; count: number }[]

    const pRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(p.id) as { tier: TierType; count: number }[]
    const { score: pObserved, count: pCount } = computeObservedScore(pRatings)
    const pTier: TierType = pCount === 0 ? 'C' : scoreToBadgeTier(pObserved)
    const pBayesian = bayesianScore(pObserved, pCount, brandGlobalMean)

    const ratingMap: Record<string, number> = {}
    for (const pr of pRatings) ratingMap[pr.tier] = pr.count
    const worthItCount = (ratingMap['S'] || 0) + (ratingMap['A'] || 0)
    const worth_it_pct = pCount > 0 ? Math.round((worthItCount / pCount) * 100) : 0

    return {
      ...p,
      tier: pTier,
      labels,
      bayesian_score: Math.round(pBayesian * 1000) / 1000,
      observed_score: Math.round(pObserved * 1000) / 1000,
      rating_count: pCount,
      worth_it_pct,
      _bayesian: pBayesian,
    }
  })

  productsEnriched.sort((a, b) => (b._bayesian as number) - (a._bayesian as number))

  // Auto-assign "Most Popular" label to top product
  if (productsEnriched.length > 0) {
    const topProduct = productsEnriched[0]
    const labelsArr = topProduct.labels as { label: string; count: number }[]
    if (!labelsArr.some(l => l.label === 'Most Popular')) {
      labelsArr.unshift({ label: 'Most Popular', count: -1 })
    }
  }

  const finalProducts = productsEnriched.map(({ _bayesian, ...rest }) => rest)

  res.json({
    ...brand,
    community_tier: computeBrandTier(id),
    products: finalProducts,
  })
})

export default router
