/**
 * Tests for the task recommender and execution policy.
 *
 * Run:  npx tsx --test tests/recommender.test.ts
 *
 * Uses node:test + node:assert (zero dependencies).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  recommendExecution,
  type TaskLaunchConfig,
  type AgentStrategy,
  type RecommendationOverrides,
} from '../lib/task-recommender'
import type { Agent, RoleAssignment } from '../lib/types'

// --- Fixtures ---

const makeConfig = (overrides: Partial<TaskLaunchConfig> = {}): TaskLaunchConfig => ({
  project_id: 'proj-1',
  goal: '',
  urgency: 'medium',
  tradeoff: 'balanced',
  recurring: false,
  ...overrides,
})

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'ResearchBot',
  slug: 'research-bot',
  description: 'A research agent',
  system_prompt: '',
  specialization: 'Market research',
  default_model: 'gpt-4o-mini',
  escalation_model: 'claude-3-opus',
  max_budget_per_run: 1.0,
  allowed_tools: [],
  avatar_color: '#3b82f6',
  is_active: true,
  total_runs: 12,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockAssignment: RoleAssignment = {
  id: 'ra-1',
  project_id: 'proj-1',
  role: 'research',
  agent_id: 'agent-1',
  notes: '',
  created_at: '2024-01-01T00:00:00Z',
}

// --- Tests ---

describe('recommendExecution', () => {
  describe('role inference', () => {
    it('infers research role from keyword matches', () => {
      const config = makeConfig({ goal: 'analyze competitor trends in the market' })
      const rec = recommendExecution(config, [], [])
      assert.equal(rec.role, 'research')
      assert.equal(rec.role_label, 'Research')
      assert.ok(rec.reasons.role_reason.includes('Matched keywords'))
      assert.ok(rec.reasons.role_reason.includes('"competitor"'))
    })

    it('infers strategy role from strategy keywords', () => {
      const config = makeConfig({ goal: 'create a pricing strategy for retention' })
      const rec = recommendExecution(config, [], [])
      assert.equal(rec.role, 'strategy')
    })

    it('infers content role from content keywords', () => {
      const config = makeConfig({ goal: 'write a blog article and newsletter' })
      const rec = recommendExecution(config, [], [])
      assert.equal(rec.role, 'content')
    })

    it('defaults to research when no keywords match', () => {
      const config = makeConfig({ goal: 'do something vague' })
      const rec = recommendExecution(config, [], [])
      assert.equal(rec.role, 'research')
      assert.ok(rec.reasons.role_reason.includes('No strong keyword match'))
    })
  })

  describe('agent strategy', () => {
    it('returns reuse_existing when agent is assigned', () => {
      const config = makeConfig({ goal: 'research competitor landscape' })
      const rec = recommendExecution(config, [mockAgent], [mockAssignment])
      assert.equal(rec.agent_strategy, 'reuse_existing')
      assert.equal(rec.agent_id, 'agent-1')
      assert.equal(rec.agent_name, 'ResearchBot')
      assert.ok(rec.reasons.agent_reason.includes('ResearchBot'))
    })

    it('returns create_persistent when no agent assigned', () => {
      const config = makeConfig({ goal: 'research competitor landscape' })
      const rec = recommendExecution(config, [], [])
      assert.equal(rec.agent_strategy, 'create_persistent')
      assert.equal(rec.agent_id, null)
      assert.ok(rec.reasons.agent_reason.includes('No agent is assigned'))
    })
  })

  describe('tier recommendation', () => {
    it('uses economy as default for research role', () => {
      const config = makeConfig({ goal: 'research market data' })
      const rec = recommendExecution(config, [], [])
      assert.equal(rec.tier, 'economy')
    })

    it('escalates tier on critical urgency', () => {
      const config = makeConfig({ goal: 'research market data', urgency: 'critical' })
      const rec = recommendExecution(config, [], [])
      // economy + 2 (critical) = premium
      assert.equal(rec.tier, 'premium')
    })

    it('bumps tier up for quality tradeoff', () => {
      const config = makeConfig({ goal: 'research market data', tradeoff: 'quality' })
      const rec = recommendExecution(config, [], [])
      // economy + 1 (quality) = standard
      assert.equal(rec.tier, 'standard')
    })

    it('bumps tier down for cost tradeoff', () => {
      const config = makeConfig({ goal: 'create a pricing strategy', tradeoff: 'cost' })
      const rec = recommendExecution(config, [], [])
      // standard - 1 (cost) = economy
      assert.equal(rec.tier, 'economy')
    })
  })

  describe('overrides', () => {
    it('applies tier override', () => {
      const config = makeConfig({ goal: 'research market data' })
      const overrides: RecommendationOverrides = { tier: 'premium' }
      const rec = recommendExecution(config, [], [], overrides)
      assert.equal(rec.tier, 'premium')
      assert.equal(rec.tier_label, 'Premium')
      assert.ok(rec.reasons.tier_reason.includes('Manually set to Premium'))
      assert.ok(rec.reasons.tier_reason.includes('system recommended Economy'))
    })

    it('applies autonomy override', () => {
      const config = makeConfig({ goal: 'research market data' })
      const overrides: RecommendationOverrides = { autonomy: 'observe' }
      const rec = recommendExecution(config, [], [], overrides)
      assert.equal(rec.autonomy, 'observe')
      assert.ok(rec.reasons.autonomy_reason.includes('Manually set to "observe"'))
    })

    it('applies agent_strategy override', () => {
      const config = makeConfig({ goal: 'research market data' })
      const overrides: RecommendationOverrides = { agent_strategy: 'create_temporary' }
      const rec = recommendExecution(config, [], [], overrides)
      assert.equal(rec.agent_strategy, 'create_temporary')
    })

    it('clears prefer_local when tier is overridden', () => {
      const config = makeConfig({ goal: 'research market data', tradeoff: 'cost' })
      // Without override, research + cost should prefer local
      const rec1 = recommendExecution(config, [], [])
      assert.equal(rec1.prefer_local, true)

      // With tier override, prefer_local should be false
      const overrides: RecommendationOverrides = { tier: 'standard' }
      const rec2 = recommendExecution(config, [], [], overrides)
      assert.equal(rec2.prefer_local, false)
    })
  })

  describe('workflow chain matching', () => {
    it('matches research-to-strategy chain', () => {
      const config = makeConfig({ goal: 'research competitors then create strategy memo' })
      const rec = recommendExecution(config, [], [])
      assert.ok(rec.workflow_chain !== null)
      assert.ok(rec.reasons.chain_reason !== null)
      assert.ok(rec.reasons.chain_reason!.includes('Multi-step workflow recommended'))
    })
  })

  describe('reasons structure', () => {
    it('always returns non-empty reason strings', () => {
      const config = makeConfig({ goal: 'analyze competitor pricing strategy' })
      const rec = recommendExecution(config, [], [])
      assert.ok(rec.reasons.role_reason.length > 0)
      assert.ok(rec.reasons.agent_reason.length > 0)
      assert.ok(rec.reasons.tier_reason.length > 0)
      assert.ok(rec.reasons.autonomy_reason.length > 0)
    })

    it('returns model matching the tier', () => {
      const config = makeConfig({ goal: 'research data', urgency: 'critical' })
      const rec = recommendExecution(config, [], [])
      // premium tier should get premium model
      assert.ok(rec.model.length > 0)
    })
  })
})
