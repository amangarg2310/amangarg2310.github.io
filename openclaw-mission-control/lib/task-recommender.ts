import type { Agent, RoleAssignment, RoleLane } from './types'
import {
  recommendTier,
  recommendModelForTier,
  recommendAutonomy,
  shouldPreferLocal,
  explainRecommendation,
  TIER_COST_RANGES,
  type ExecutionTier,
  type Urgency,
  type Tradeoff,
  type AutonomyLevel,
} from './execution-policy'
import { matchChainsToGoal, type WorkflowChain } from './workflow-chains'

export interface TaskLaunchConfig {
  project_id: string
  goal: string
  urgency: Urgency
  tradeoff: Tradeoff
  recurring: boolean
  recurrence_cadence?: 'daily' | 'weekly' | 'biweekly' | 'monthly'
}

export interface ExecutionRecommendation {
  role: RoleLane
  role_label: string
  tier: ExecutionTier
  tier_label: string
  autonomy: AutonomyLevel
  model: string
  agent_id: string | null
  agent_name: string | null
  create_agent: boolean
  workflow_chain: WorkflowChain | null
  reasoning: string
  estimated_cost: string
  prefer_local: boolean
}

/**
 * Keyword → role mapping for inferring the best role from a goal description.
 */
const ROLE_KEYWORDS: Record<RoleLane, string[]> = {
  research: [
    'research', 'analyze', 'competitor', 'trend', 'scan', 'investigate', 'benchmark',
    'market', 'data', 'survey', 'landscape', 'news', 'monitor', 'track', 'scrape',
  ],
  strategy: [
    'strategy', 'strategic', 'positioning', 'opportunity', 'retention', 'pricing',
    'decision', 'prioritize', 'trade-off', 'tradeoff', 'roadmap', 'memo', 'plan',
  ],
  product: [
    'product', 'feature', 'packaging', 'offering', 'spec', 'requirements', 'launch',
    'roadmap', 'release', 'mvp', 'prototype', 'brief',
  ],
  content: [
    'content', 'blog', 'article', 'copy', 'script', 'email', 'newsletter', 'social',
    'write', 'draft', 'headline', 'caption', 'channel', 'calendar',
  ],
  performance_marketing: [
    'campaign', 'ad', 'ads', 'roas', 'cpc', 'cpa', 'conversion', 'optimization',
    'performance', 'paid', 'budget', 'targeting', 'creative', 'ab test',
  ],
  consumer_insights: [
    'review', 'reviews', 'sentiment', 'feedback', 'customer', 'user research',
    'pain point', 'clustering', 'nps', 'survey', 'churn', 'satisfaction',
  ],
  advisor: [
    'advise', 'advisor', 'mentor', 'what should', 'next step', 'decision',
    'founder', 'investor', 'update', 'retrospective', 'reflection',
  ],
}

const ROLE_LABELS: Record<RoleLane, string> = {
  research: 'Research',
  strategy: 'Strategy',
  product: 'Product & PMM',
  content: 'Content & Marketing',
  performance_marketing: 'Performance Marketing',
  consumer_insights: 'Consumer Insights',
  advisor: 'Advisor',
}

const TIER_LABELS: Record<ExecutionTier, string> = {
  local: 'Local',
  economy: 'Economy',
  standard: 'Standard',
  premium: 'Premium',
}

/**
 * Infer the best role for a goal from keyword matching.
 * Returns role with highest keyword match count, defaulting to 'research'.
 */
function inferRole(goal: string): RoleLane {
  const lower = goal.toLowerCase()
  let bestRole: RoleLane = 'research'
  let bestScore = 0

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS) as [RoleLane, string[]][]) {
    const score = keywords.filter((kw) => lower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestRole = role
    }
  }

  return bestRole
}

/**
 * Produce a full execution recommendation for a task launch config.
 *
 * This is the "smart" part of the launcher — it recommends role, tier,
 * autonomy, agent, and workflow chain based on the user's goal and preferences.
 */
export function recommendExecution(
  config: TaskLaunchConfig,
  agents: Agent[],
  assignments: RoleAssignment[],
): ExecutionRecommendation {
  // 1. Infer best role
  const role = inferRole(config.goal)

  // 2. Find existing agent assignment for this role + project
  const assignment = assignments.find(
    (a) => a.project_id === config.project_id && a.role === role,
  )
  const agent = assignment ? agents.find((a) => a.id === assignment.agent_id) : undefined

  // 3. Compute tier and autonomy
  const tier = recommendTier(role, config.urgency, config.tradeoff)
  const model = recommendModelForTier(tier)
  const autonomy = recommendAutonomy(role, config.urgency)
  const preferLocal = shouldPreferLocal(role, config.tradeoff)

  // 4. Match workflow chain
  const chainMatches = matchChainsToGoal(config.goal)
  const chain = chainMatches[0] ?? null

  // 5. Build reasoning
  const reasoning = explainRecommendation(role, tier, config.urgency, config.tradeoff, preferLocal)

  return {
    role,
    role_label: ROLE_LABELS[role],
    tier,
    tier_label: TIER_LABELS[tier],
    autonomy,
    model,
    agent_id: agent?.id ?? null,
    agent_name: agent?.name ?? null,
    create_agent: !agent,
    workflow_chain: chain,
    reasoning,
    estimated_cost: TIER_COST_RANGES[tier],
    prefer_local: preferLocal,
  }
}
