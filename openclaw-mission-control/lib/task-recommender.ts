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

export type AgentStrategy = 'reuse_existing' | 'create_persistent' | 'create_temporary'

export interface ReasoningDetail {
  role_reason: string
  agent_reason: string
  tier_reason: string
  autonomy_reason: string
  chain_reason: string | null
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
  agent_strategy: AgentStrategy
  workflow_chain: WorkflowChain | null
  reasons: ReasoningDetail
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
 * Also returns the matched keywords for explainability.
 */
function inferRole(goal: string): { role: RoleLane; matchedKeywords: string[]; score: number } {
  const lower = goal.toLowerCase()
  let bestRole: RoleLane = 'research'
  let bestScore = 0
  let bestMatches: string[] = []

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS) as [RoleLane, string[]][]) {
    const matches = keywords.filter((kw) => lower.includes(kw))
    if (matches.length > bestScore) {
      bestScore = matches.length
      bestRole = role
      bestMatches = matches
    }
  }

  return { role: bestRole, matchedKeywords: bestMatches, score: bestScore }
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
  // 1. Infer best role with keyword evidence
  const { role, matchedKeywords, score } = inferRole(config.goal)

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

  // 5. Build structured reasoning
  const roleReason = score > 0
    ? `Matched keywords: ${matchedKeywords.map((k) => `"${k}"`).join(', ')}. ${ROLE_LABELS[role]} is the best fit for this type of work.`
    : `No strong keyword match — defaulting to ${ROLE_LABELS[role]} as a safe starting point.`

  const agentReason = agent
    ? `${agent.name} is already assigned to ${ROLE_LABELS[role]} for this project. ${agent.total_runs ? `${agent.total_runs} prior runs.` : ''}`
    : `No agent is assigned to ${ROLE_LABELS[role]} for this project. You can create a persistent project agent or use a temporary one.`

  const tierReason = explainRecommendation(role, tier, config.urgency, config.tradeoff, preferLocal)

  const autonomyReason = config.urgency === 'critical'
    ? `Critical urgency requires human oversight — using "${autonomy}" mode.`
    : config.urgency === 'low'
    ? `Low urgency allows more agent freedom — using "${autonomy}" mode.`
    : `Default "${autonomy}" mode for ${ROLE_LABELS[role]} tasks at ${config.urgency} urgency.`

  const chainReason = chain
    ? `Goal matches the "${chain.name}" pattern (${chain.steps.map((s) => ROLE_LABELS[s.role]).join(' → ')}). Multi-step workflow recommended.`
    : null

  // 6. Determine agent strategy
  const agentStrategy: AgentStrategy = agent ? 'reuse_existing' : 'create_persistent'

  return {
    role,
    role_label: ROLE_LABELS[role],
    tier,
    tier_label: TIER_LABELS[tier],
    autonomy,
    model,
    agent_id: agent?.id ?? null,
    agent_name: agent?.name ?? null,
    agent_strategy: agentStrategy,
    workflow_chain: chain,
    reasons: {
      role_reason: roleReason,
      agent_reason: agentReason,
      tier_reason: tierReason,
      autonomy_reason: autonomyReason,
      chain_reason: chainReason,
    },
    estimated_cost: TIER_COST_RANGES[tier],
    prefer_local: preferLocal,
  }
}
