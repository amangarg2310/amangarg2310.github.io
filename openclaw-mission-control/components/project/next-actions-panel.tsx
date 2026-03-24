'use client'

import {
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Zap,
  ArrowRight,
} from 'lucide-react'
import type { NextAction } from '@/lib/types'

interface NextActionsPanelProps {
  actions: NextAction[]
}

const TYPE_ICONS = {
  assign_role: UserPlus,
  review_approval: ShieldCheck,
  investigate_stall: AlertCircle,
  enable_automation: Zap,
  run_workflow: ArrowRight,
}

const PRIORITY_COLORS = {
  high: 'border-l-red-400',
  medium: 'border-l-amber-400',
  low: 'border-l-blue-400',
}

export function NextActionsPanel({ actions }: NextActionsPanelProps) {
  if (actions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Recommended Actions
        </h3>
        <p className="text-xs text-muted-foreground/60 text-center py-4">
          No recommended actions right now. Everything looks good.
        </p>
      </div>
    )
  }

  // Sort: high first, then medium, then low
  const sorted = [...actions].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.priority] - order[b.priority]
  })

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Recommended Actions
      </h3>
      <div className="space-y-2">
        {sorted.map((action) => {
          const Icon = TYPE_ICONS[action.type]
          return (
            <div
              key={action.id}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg bg-background/50 border border-border/30 border-l-2 ${PRIORITY_COLORS[action.priority]} hover:bg-background/80 transition-colors cursor-pointer`}
            >
              <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">{action.title}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{action.description}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
