'use client'

import {
  Bot,
  Cpu,
  Shield,
  ArrowRight,
  Plus,
  Lightbulb,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import type { ExecutionRecommendation } from '@/lib/task-recommender'
import type { WorkflowChain } from '@/lib/workflow-chains'

interface RecommendationPanelProps {
  recommendation: ExecutionRecommendation | null
  loading: boolean
  onOverrideTier?: (tier: string) => void
  onOverrideAutonomy?: (level: string) => void
}

const TIER_COLORS: Record<string, string> = {
  local: 'border-gray-500/30 bg-gray-500/10 text-gray-400',
  economy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  standard: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  premium: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
}

const AUTONOMY_LABELS: Record<string, string> = {
  observe: 'Observe — Agent explains, you act',
  plan: 'Plan — Agent proposes, you approve',
  confirm: 'Confirm — Agent acts, you confirm key steps',
  autonomous: 'Autonomous — Agent runs freely',
}

export function RecommendationPanel({ recommendation, loading, onOverrideTier, onOverrideAutonomy }: RecommendationPanelProps) {
  const [showReasoning, setShowReasoning] = useState(false)

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-4 bg-border/30 rounded w-32" />
        <div className="h-20 bg-border/20 rounded-xl" />
        <div className="h-16 bg-border/20 rounded-xl" />
        <div className="h-16 bg-border/20 rounded-xl" />
      </div>
    )
  }

  if (!recommendation) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Lightbulb className="w-8 h-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground/60">
          Describe your goal to get smart recommendations
        </p>
        <p className="text-xs text-muted-foreground/40 mt-1">
          Best role, compute tier, autonomy level, and more
        </p>
      </div>
    )
  }

  const rec = recommendation

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Recommendations
      </h3>

      {/* Best Role */}
      <div className="bg-background/50 border border-border/30 rounded-xl px-4 py-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Best Role</div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-sm font-medium text-foreground">{rec.role_label}</span>
        </div>
      </div>

      {/* Agent */}
      <div className="bg-background/50 border border-border/30 rounded-xl px-4 py-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Agent</div>
        {rec.agent_id ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm font-medium text-foreground">{rec.agent_name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-400">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Create new {rec.role_label} agent</span>
          </div>
        )}
      </div>

      {/* Compute Tier */}
      <div className="bg-background/50 border border-border/30 rounded-xl px-4 py-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Compute Tier</div>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <span className={`text-sm font-medium px-2 py-0.5 rounded border ${TIER_COLORS[rec.tier] || TIER_COLORS.standard}`}>
            {rec.tier_label}
          </span>
          <span className="text-xs text-muted-foreground font-mono">{rec.estimated_cost}</span>
        </div>
        {rec.prefer_local && (
          <p className="text-[10px] text-emerald-400 mt-1.5">Local-first recommended — comparable quality at lower cost</p>
        )}
        {onOverrideTier && (
          <div className="flex gap-1.5 mt-2">
            {['local', 'economy', 'standard', 'premium'].map((t) => (
              <button
                key={t}
                onClick={() => onOverrideTier(t)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  t === rec.tier
                    ? TIER_COLORS[t]
                    : 'border-border/30 text-muted-foreground/50 hover:text-muted-foreground'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Autonomy */}
      <div className="bg-background/50 border border-border/30 rounded-xl px-4 py-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Autonomy Level</div>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-foreground">{AUTONOMY_LABELS[rec.autonomy] || rec.autonomy}</span>
        </div>
      </div>

      {/* Workflow Chain */}
      {rec.workflow_chain && (
        <WorkflowChainCard chain={rec.workflow_chain} />
      )}

      {/* Reasoning */}
      <button
        onClick={() => setShowReasoning(!showReasoning)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {showReasoning ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Why this recommendation?
      </button>
      {showReasoning && (
        <div className="bg-background/30 border border-border/20 rounded-lg px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">{rec.reasoning}</p>
        </div>
      )}
    </div>
  )
}

function WorkflowChainCard({ chain }: { chain: WorkflowChain }) {
  return (
    <div className="bg-background/50 border border-border/30 rounded-xl px-4 py-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Suggested Workflow</div>
      <div className="text-sm font-medium text-foreground mb-2">{chain.name}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {chain.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent">
              {step.action}
            </span>
            {i < chain.steps.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">{chain.description}</p>
    </div>
  )
}
