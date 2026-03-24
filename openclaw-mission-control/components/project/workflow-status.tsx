'use client'

import { ArrowRight, CheckCircle2, Loader2, Clock } from 'lucide-react'
import type { WorkflowInstanceSummary } from '@/lib/types'

interface WorkflowStatusProps {
  workflows: WorkflowInstanceSummary[]
}

const STATUS_ICON = {
  running: Loader2,
  waiting: Clock,
  completed: CheckCircle2,
  failed: CheckCircle2,
}

const STATUS_COLOR = {
  running: 'text-blue-400',
  waiting: 'text-amber-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
}

export function WorkflowStatus({ workflows }: WorkflowStatusProps) {
  if (workflows.length === 0) return null

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Active Workflows
      </h3>
      <div className="space-y-3">
        {workflows.map((wf) => {
          const Icon = STATUS_ICON[wf.status]
          return (
            <div key={wf.id} className="flex items-center gap-3">
              <Icon className={`w-4 h-4 ${STATUS_COLOR[wf.status]} shrink-0 ${wf.status === 'running' ? 'animate-spin' : ''}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">{wf.chain_name}</div>
                <div className="flex items-center gap-1 mt-1">
                  {Array.from({ length: wf.total_steps }).map((_, i) => (
                    <div key={i} className="flex items-center">
                      <div className={`w-2 h-2 rounded-full ${
                        i < wf.current_step ? 'bg-emerald-400' :
                        i === wf.current_step ? 'bg-blue-400 led-pulse' :
                        'bg-muted-foreground/20'
                      }`} />
                      {i < wf.total_steps - 1 && (
                        <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/30 mx-0.5" />
                      )}
                    </div>
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-2">
                    Step {wf.current_step + 1} of {wf.total_steps}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
