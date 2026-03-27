import type { RoleLane } from './types'

export type ExecutionTier = 'local' | 'economy' | 'standard' | 'premium'
export type Urgency = 'low' | 'medium' | 'high' | 'critical'
export type Tradeoff = 'cost' | 'balanced' | 'quality'
export type AutonomyLevel = 'observe' | 'plan' | 'confirm' | 'autonomous'

/**
 * Default execution tier per role lane.
 *
 * Research/Consumer Insights: economy (local-first, escalate for synthesis)
 * Content: economy (routine generation)
 * Strategy: standard (needs reasoning quality)
 * Product/PMM: standard
 * Performance Marketing: standard (economy for routine)
 * Advisor: standard (premium for high-stakes)
 */
export const ROLE_TIER_DEFAULTS: Record<RoleLane, ExecutionTier> = {
  research: 'economy',
  strategy: 'standard',
  product: 'standard',
  content: 'economy',
  performance_marketing: 'standard',
  consumer_insights: 'economy',
  advisor: 'standard',
}

const ROLE_AUTONOMY_DEFAULTS: Record<RoleLane, AutonomyLevel> = {
  research: 'autonomous',
  strategy: 'confirm',
  product: 'confirm',
  content: 'autonomous',
  performance_marketing: 'plan',
  consumer_insights: 'autonomous',
  advisor: 'plan',
}

const TIER_ORDER: ExecutionTier[] = ['local', 'economy', 'standard', 'premium']

function tierIndex(tier: ExecutionTier): number {
  return TIER_ORDER.indexOf(tier)
}

function clampTier(idx: number): ExecutionTier {
  return TIER_ORDER[Math.max(0, Math.min(idx, TIER_ORDER.length - 1))]
}

/**
 * Recommend execution tier based on role, urgency, and cost/quality tradeoff.
 * High urgency bumps up. Cost tradeoff bumps down. Quality tradeoff bumps up.
 */
export function recommendTier(role: RoleLane, urgency: Urgency, tradeoff: Tradeoff): ExecutionTier {
  const base = ROLE_TIER_DEFAULTS[role]
  let idx = tierIndex(base)

  // Urgency escalation
  if (urgency === 'high') idx += 1
  if (urgency === 'critical') idx += 2

  // Tradeoff adjustment
  if (tradeoff === 'cost') idx -= 1
  if (tradeoff === 'quality') idx += 1

  return clampTier(idx)
}

/**
 * Map execution tier to a concrete model name.
 * Uses Anthropic model IDs matching the OpenClaw /model picker.
 */
export function recommendModelForTier(tier: ExecutionTier): string {
  switch (tier) {
    case 'local': return 'local-llm'
    case 'economy': return 'anthropic/claude-haiku-4-5'
    case 'standard': return 'anthropic/claude-sonnet-4-6'
    case 'premium': return 'anthropic/claude-opus-4-5'
  }
}

/**
 * Recommend autonomy level based on role and urgency.
 * Critical tasks get more oversight. Routine roles get more autonomy.
 */
export function recommendAutonomy(role: RoleLane, urgency: Urgency): AutonomyLevel {
  const base = ROLE_AUTONOMY_DEFAULTS[role]

  // Critical → always require confirmation at minimum
  if (urgency === 'critical') {
    if (base === 'autonomous') return 'confirm'
    return base
  }

  // Low urgency → can grant more autonomy
  if (urgency === 'low' && base === 'plan') return 'autonomous'

  return base
}

/**
 * Whether to prefer local execution for a given role + tradeoff.
 */
export function shouldPreferLocal(role: RoleLane, tradeoff: Tradeoff): boolean {
  if (tradeoff === 'quality') return false
  // These roles do well with local models for routine work
  const localFriendly: RoleLane[] = ['research', 'consumer_insights', 'content']
  return localFriendly.includes(role) && tradeoff === 'cost'
}

/**
 * Human-readable explanation of why a tier was recommended.
 */
export function explainRecommendation(
  role: RoleLane,
  tier: ExecutionTier,
  urgency: Urgency,
  tradeoff: Tradeoff,
  preferLocal: boolean,
): string {
  const roleName = ROLE_LABELS[role]
  const tierName = TIER_LABELS[tier]

  const parts: string[] = []

  if (preferLocal) {
    parts.push(`Local-first recommended for ${roleName} — comparable output quality at lower cost.`)
  }

  const baseTier = ROLE_TIER_DEFAULTS[role]
  if (tier !== baseTier) {
    if (tierIndex(tier) > tierIndex(baseTier)) {
      if (urgency === 'critical' || urgency === 'high') {
        parts.push(`Escalated to ${tierName} due to ${urgency} urgency.`)
      }
      if (tradeoff === 'quality') {
        parts.push(`Quality-optimized: using ${tierName} for better output.`)
      }
    } else {
      if (tradeoff === 'cost') {
        parts.push(`Cost-optimized: ${tierName} is sufficient for this ${roleName} task.`)
      }
    }
  } else {
    parts.push(`${tierName} is the default for ${roleName} tasks.`)
  }

  return parts.join(' ') || `${tierName} recommended for ${roleName}.`
}

export const ROLE_LABELS: Record<RoleLane, string> = {
  research: 'Research',
  strategy: 'Strategy',
  product: 'Product & PMM',
  content: 'Content & Marketing',
  performance_marketing: 'Performance Marketing',
  consumer_insights: 'Consumer Insights',
  advisor: 'Advisor',
}

export const TIER_LABELS: Record<ExecutionTier, string> = {
  local: 'Local',
  economy: 'Economy',
  standard: 'Standard',
  premium: 'Premium',
}

export const TIER_COST_RANGES: Record<ExecutionTier, string> = {
  local: '$0.00',
  economy: '$0.01 – $0.05',
  standard: '$0.10 – $0.30',
  premium: '$0.50 – $2.00',
}
