'use client'

import {
  Bot,
  Cpu,
  Shield,
  ArrowRight,
  Plus,
  Lightbulb,
  Info,
  UserCheck,
  Clock,
} from 'lucide-react'
import { useState } from 'react'
import type { ExecutionRecommendation, AgentStrategy } from '@/lib/task-recommender'
import type { WorkflowChain } from '@/lib/workflow-chains'

interface RecommendationPanelProps {
  recommendation: ExecutionRecommendation | null
  loading: boolean
  onOverrideTier?: (tier: string) => void
  onOverrideAutonomy?: (level: string) => void
  onOverrideAgentStrategy?: (strategy: AgentStrategy) => void
}

const TIER_COLORS: Record<string, string> = {
  local: 'border-gray-500/30 bg-gray-500/10 text-gray-400',
  economy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  standard: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  premium: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
}

const AUTONOMY_LABELS: Record<string, { label: string; desc: string }> = {
  observe: { label: 'Observe', desc: 'Agent explains, you act' },
  plan: { label: 'Plan', desc: 'Agent proposes, you approve' },
  confirm: { label: 'Confirm', desc: 'Agent acts, you confirm key steps' },
  autonomous: { label: 'Autonomous', desc: 'Agent runs freely' },
}

const AGENT_STRATEGY_OPTIONS: { id: AgentStrategy; label: string; icon: typeof Bot; desc: string }[] = [
  { id: 'reuse_existing', label: 'Reuse Existing', icon: UserCheck, desc: 'Use the currently assigned agent' },
  { id: 'create_persistent', label: 'Create Project Agent', icon: Bot, desc: 'New agent dedicated to this project' },
  { id: 'create_temporary', label: 'Temporary Agent', icon: Clock, desc: 'One-off agent, auto-removed after task' },
]

function WhyBadge({ reason }: { reason: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setShow(!show)}
        className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        title="Why?"
      >
        <Info className="w-2.5 h-2.5" />
        why
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-0 mb-1 w-56 bg-card border border-border rounded-lg shadow-lg px-3 py-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">{reason}</p>
        </div>
      )}
    </span>
  )
}

export function RecommendationPanel({
  recommendation,
  loading,
  onOverrideTier,
  onOverrideAutonomy,
  onOverrideAgentStrategy,
}: RecommendationPanelProps) {
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
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Recommendations
      </h3>

      {/* Best Role */}
      <RecommendationCard
        label="Best Role"
        reason={rec.reasons.role_reason}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-sm font-medium text-foreground">{rec.role_label}</span>
        </div>
      </RecommendationCard>

      {/* Agent Strategy */}
      <RecommendationCard
        label="Agent"
        reason={rec.reasons.agent_reason}
      >
        {rec.agent_id ? (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
              <UserCheck className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm font-medium text-foreground">{rec.agent_name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">No agent assigned</span>
          </div>
        )}
        <div className="space-y-1.5">
          {AGENT_STRATEGY_OPTIONS.map((opt) => {
            const isSelected = rec.agent_strategy === opt.id
            const isDisabled = opt.id === 'reuse_existing' && !rec.agent_id
            const Icon = opt.icon
            return (
              <button
                key={opt.id}
                onClick={() => onOverrideAgentStrategy?.(opt.id)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-xs ${
                  isSelected
                    ? 'bg-accent/10 border border-accent/30 text-foreground'
                    : isDisabled
                    ? 'opacity-30 cursor-not-allowed border border-transparent'
                    : 'border border-border/20 text-muted-foreground hover:border-border/50 hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <div>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </RecommendationCard>

      {/* Compute Tier */}
      <RecommendationCard
        label="Compute Tier"
        reason={rec.reasons.tier_reason}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <span className={`text-sm font-medium px-2 py-0.5 rounded border ${TIER_COLORS[rec.tier] || TIER_COLORS.standard}`}>
            {rec.tier_label}
          </span>
          <span className="text-xs text-muted-foreground font-mono">{rec.estimated_cost}</span>
        </div>
        {rec.prefer_local && (
          <p className="text-[10px] text-emerald-400 mb-1.5">Local-first — comparable quality at lower cost</p>
        )}
        <div className="flex gap-1.5">
          {['local', 'economy', 'standard', 'premium'].map((t) => (
            <button
              key={t}
              onClick={() => onOverrideTier?.(t)}
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
      </RecommendationCard>

      {/* Autonomy */}
      <RecommendationCard
        label="Autonomy Level"
        reason={rec.reasons.autonomy_reason}
      >
        <div className="space-y-1.5">
          {Object.entries(AUTONOMY_LABELS).map(([key, val]) => {
            const isSelected = rec.autonomy === key
            return (
              <button
                key={key}
                onClick={() => onOverrideAutonomy?.(key)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-xs ${
                  isSelected
                    ? 'bg-accent/10 border border-accent/30 text-foreground'
                    : 'border border-border/20 text-muted-foreground hover:border-border/50 hover:text-foreground'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <div>
                  <span className="font-medium">{val.label}</span>
                  <span className="text-muted-foreground ml-1">— {val.desc}</span>
                </div>
              </button>
            )
          })}
        </div>
      </RecommendationCard>

      {/* Workflow Chain */}
      {rec.workflow_chain && (
        <RecommendationCard
          label="Suggested Workflow"
          reason={rec.reasons.chain_reason || ''}
        >
          <WorkflowChainCard chain={rec.workflow_chain} />
        </RecommendationCard>
      )}
    </div>
  )
}

function RecommendationCard({
  label,
  reason,
  children,
}: {
  label: string
  reason: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-background/50 border border-border/30 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        {reason && <WhyBadge reason={reason} />}
      </div>
      {children}
    </div>
  )
}

function WorkflowChainCard({ chain }: { chain: WorkflowChain }) {
  return (
    <div>
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
