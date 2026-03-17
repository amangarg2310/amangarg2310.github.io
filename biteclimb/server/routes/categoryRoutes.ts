import { Router } from 'express'
import db from '../db.js'
import { optionalAuth } from '../auth.js'
import type { AuthRequest } from '../auth.js'

const router = Router()

type TierType = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

const TIER_WEIGHTS: Record<TierType, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 }

function computeObservedScore(ratings: { tier: TierType; count: number }[]): { score: number; count: number } {
  let totalWeight = 0
  let totalCount = 0
  for (const r of ratings) {
    totalWeight += TIER_WEIGHTS[r.tier] * r.count
    totalCount += r.count
  }
  return { score: totalCount > 0 ? totalWeight / totalCount : 0, count: totalCount }
}

function scoreToBadgeTier(score: number): TierType {
  if (score >= 5.5) return 'S'
  if (score >= 4.5) return 'A'
  if (score >= 3.5) return 'B'
  if (score >= 2.5) return 'C'
  if (score >= 1.5) return 'D'
  return 'F'
}

// GET /api/categories — list all categories with product counts and top product preview
router.get('/', optionalAuth, (_req: AuthRequest, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all() as Record<string, unknown>[]

  const enriched = categories.map(cat => {
    const productCount = (db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(cat.id) as { count: number }).count
    const ratingCount = (db.prepare(`
      SELECT COUNT(*) as count FROM ratings r
      JOIN products p ON r.product_id = p.id
      WHERE p.category_id = ?
    `).get(cat.id) as { count: number }).count

    // Top product in this category by rating count
    const topProduct = db.prepare(`
      SELECT p.id, p.name, p.image_url, p.price_range,
        b.name as brand_name,
        (SELECT COUNT(*) FROM ratings WHERE product_id = p.id) as product_rating_count
      FROM products p
      JOIN brands b ON p.brand_id = b.id
      WHERE p.category_id = ?
      ORDER BY product_rating_count DESC
      LIMIT 1
    `).get(cat.id) as Record<string, unknown> | undefined

    let topProductEnriched: Record<string, unknown> | null = null
    if (topProduct) {
      const pRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(topProduct.id) as { tier: TierType; count: number }[]
      const { score, count } = computeObservedScore(pRatings)
      const tier = count === 0 ? 'C' : scoreToBadgeTier(score)
      topProductEnriched = { ...topProduct, tier }
    }

    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      emoji: cat.emoji,
      sort_order: cat.sort_order,
      product_count: productCount,
      rating_count: ratingCount,
      top_product: topProductEnriched,
    }
  })

  res.json(enriched)
})

// GET /api/categories/:slug — category detail with ranked products
router.get('/:slug', optionalAuth, (req: AuthRequest, res) => {
  const { slug } = req.params
  const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug) as Record<string, unknown> | undefined

  if (!cat) {
    res.status(404).json({ error: 'Category not found' })
    return
  }

  // Fetch all products in this category with brand info
  const products = db.prepare(`
    SELECT p.id, p.name, p.image_url, p.price_range, p.size, p.subcategory,
      p.brand_id, p.seed_score, p.seed_tier,
      b.name as brand_name,
      (SELECT COUNT(*) FROM ratings WHERE product_id = p.id) as rating_count,
      (SELECT COUNT(*) FROM ratings WHERE product_id = p.id AND created_at > datetime('now', '-7 days')) as week_ratings
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    WHERE p.category_id = ?
  `).all(cat.id) as Record<string, unknown>[]

  // Compute tiers and sort by score
  const enriched = products.map(p => {
    const pRatings = db.prepare('SELECT tier, COUNT(*) as count FROM ratings WHERE product_id = ? GROUP BY tier').all(p.id) as { tier: TierType; count: number }[]
    const { score, count } = computeObservedScore(pRatings)
    const effectiveScore = count > 0 ? score : ((p.seed_score as number | null) ?? 0)
    const tier = count === 0
      ? (p.seed_tier && ['S', 'A', 'B', 'C', 'D', 'F'].includes(p.seed_tier as string) ? p.seed_tier as TierType : 'C' as TierType)
      : scoreToBadgeTier(score)

    const labels = db.prepare(`
      SELECT label, COUNT(*) as count
      FROM product_labels WHERE product_id = ?
      GROUP BY label ORDER BY count DESC LIMIT 2
    `).all(p.id) as { label: string; count: number }[]

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
      price_range: p.price_range,
      size: p.size,
      subcategory: p.subcategory,
      tier,
      rating_count: count,
      week_ratings: p.week_ratings,
      labels,
      friends_rated_count,
      _score: effectiveScore,
    }
  })

  enriched.sort((a, b) => (b._score as number) - (a._score as number))
  const finalProducts = enriched.map(({ _score, ...rest }, i) => ({ ...rest, rank: i + 1 }))

  // Subcategories
  const subcategories = db.prepare(`
    SELECT DISTINCT subcategory FROM products
    WHERE category_id = ? AND subcategory != ''
    ORDER BY subcategory
  `).all(cat.id) as { subcategory: string }[]

  // Brand breakdown
  const brandBreakdown = db.prepare(`
    SELECT b.id, b.name, b.logo_url, COUNT(p.id) as product_count
    FROM brands b
    JOIN products p ON p.brand_id = b.id
    WHERE p.category_id = ?
    GROUP BY b.id
    ORDER BY product_count DESC
  `).all(cat.id) as Record<string, unknown>[]

  res.json({
    ...cat,
    products: finalProducts,
    subcategories: subcategories.map(s => s.subcategory),
    brands: brandBreakdown,
    product_count: finalProducts.length,
  })
})

export default router
