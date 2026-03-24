import type { RoleLane } from './types'
import type { ExecutionTier } from './execution-policy'

export interface WorkflowStep {
  role: RoleLane
  action: string
  tier: ExecutionTier
}

export interface WorkflowChain {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
}

/**
 * Active workflow instance that tracks execution through a chain.
 * Dashboard-owned, persisted alongside projects.
 */
export interface WorkflowInstance {
  id: string
  chain_id: string
  project_id: string
  current_step: number            // 0-indexed into chain.steps
  status: 'running' | 'waiting' | 'completed' | 'failed'
  step_run_ids: (string | null)[] // run ID for each step (null = not started)
  created_at: string
  updated_at: string
}

/**
 * Predefined workflow chains.
 *
 * These are the handoff patterns that connect role lanes.
 * When a step completes, the orchestrator automatically queues the next step's role.
 */
export const WORKFLOW_CHAINS: WorkflowChain[] = [
  {
    id: 'research-to-strategy',
    name: 'Research → Strategy',
    description: 'Gather intelligence then synthesize into strategic recommendations',
    steps: [
      { role: 'research', action: 'Gather data and intelligence', tier: 'economy' },
      { role: 'strategy', action: 'Synthesize findings into strategy', tier: 'standard' },
    ],
  },
  {
    id: 'strategy-to-product',
    name: 'Strategy → Product',
    description: 'Translate strategy into product decisions and roadmap items',
    steps: [
      { role: 'strategy', action: 'Define strategic direction', tier: 'standard' },
      { role: 'product', action: 'Translate into product requirements', tier: 'standard' },
    ],
  },
  {
    id: 'strategy-to-content',
    name: 'Strategy → Content',
    description: 'Turn strategic positioning into content and marketing plans',
    steps: [
      { role: 'strategy', action: 'Define positioning and messaging', tier: 'standard' },
      { role: 'content', action: 'Create content plan and assets', tier: 'economy' },
    ],
  },
  {
    id: 'content-to-performance',
    name: 'Content → Performance',
    description: 'Take content assets and optimize for paid channels',
    steps: [
      { role: 'content', action: 'Produce content and copy', tier: 'economy' },
      { role: 'performance_marketing', action: 'Optimize for ad performance', tier: 'standard' },
    ],
  },
  {
    id: 'full-go-to-market',
    name: 'Full Go-to-Market',
    description: 'End-to-end: research → strategy → product → content → performance',
    steps: [
      { role: 'research', action: 'Market and competitor research', tier: 'economy' },
      { role: 'strategy', action: 'Go-to-market strategy', tier: 'standard' },
      { role: 'product', action: 'Product packaging and positioning', tier: 'standard' },
      { role: 'content', action: 'Content and messaging', tier: 'economy' },
      { role: 'performance_marketing', action: 'Launch campaigns', tier: 'standard' },
    ],
  },
  {
    id: 'insight-to-action',
    name: 'Insights → Action',
    description: 'Consumer insights drive strategy which drives product changes',
    steps: [
      { role: 'consumer_insights', action: 'Analyze feedback and sentiment', tier: 'economy' },
      { role: 'strategy', action: 'Prioritize based on insights', tier: 'standard' },
      { role: 'product', action: 'Implement product changes', tier: 'standard' },
    ],
  },
]

/**
 * Find chains that match a goal based on keyword heuristics.
 */
export function matchChainsToGoal(goal: string): WorkflowChain[] {
  const lower = goal.toLowerCase()
  const matches: WorkflowChain[] = []

  const keywords: Record<string, string[]> = {
    'research-to-strategy': ['research', 'analyze', 'competitor', 'market', 'intelligence', 'investigate'],
    'strategy-to-product': ['roadmap', 'product strategy', 'feature', 'prioritize', 'build'],
    'strategy-to-content': ['messaging', 'positioning', 'content strategy', 'brand'],
    'content-to-performance': ['campaign', 'ad', 'promote', 'launch content', 'distribute'],
    'full-go-to-market': ['go to market', 'gtm', 'launch', 'full pipeline', 'end to end'],
    'insight-to-action': ['feedback', 'reviews', 'sentiment', 'customer insight', 'user research'],
  }

  for (const chain of WORKFLOW_CHAINS) {
    const chainKeywords = keywords[chain.id] || []
    if (chainKeywords.some((kw) => lower.includes(kw))) {
      matches.push(chain)
    }
  }

  return matches
}
