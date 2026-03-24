'use client'

import { ArrowRight, CheckCircle2, Loader2, Clock, Pause, Play, XCircle, Info } from 'lucide-react'
import { useState } from 'react'
import type { WorkflowInstanceSummary } from '@/lib/types'
import { WORKFLOW_CHAINS } from '@/lib/workflow-chains'
import { ROLE_LABELS } from '@/lib/execution-policy'
import { timeAgo } from '@/lib/utils'

interface WorkflowStatusProps {
  workflows: WorkflowInstanceSummary[]
  onPause?: (workflowId: string) => void
  onResume?: (workflowId: string) => void
}

const STATUS_CONFIG = {
  running: { icon: Loader2, color: 'text-blue-400', label: 'Running', spin: true },
  waiting: { icon: Clock, color: 'text-amber-400', label: 'Waiting for next step', spin: false },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Completed', spin: false },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Failed', spin: false },
}

export function WorkflowStatus({ workflows, onPause, onResume }: WorkflowStatusProps) {
  if (workflows.length === 0) return null

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Active Workflows
      </h3>
      <div className="space-y-4">
        {workflows.map((wf) => (
          <WorkflowItem
            key={wf.id}
            workflow={wf}
            onPause={onPause}
            onResume={onResume}
          />
        ))}
      </div>
    </div>
  )
}

function WorkflowItem({
  workflow: wf,
  onPause,
  onResume,
}: {
  workflow: WorkflowInstanceSummary
  onPause?: (id: string) => void
  onResume?: (id: string) => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  const config = STATUS_CONFIG[wf.status]
  const Icon = config.icon

  // Look up chain definition for step labels
  const chain = WORKFLOW_CHAINS.find((c) => c.name === wf.chain_name || c.id === wf.chain_name)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${config.color} shrink-0 ${config.spin ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{wf.chain_name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${config.color} bg-current/10`}>
              {config.label}
            </span>
          </div>

          {/* Step progress with labels */}
          <div className="flex items-center gap-1 mt-1.5">
            {Array.from({ length: wf.total_steps }).map((_, i) => {
              const step = chain?.steps[i]
              const stepLabel = step ? ROLE_LABELS[step.role] : `Step ${i + 1}`
              const isComplete = i < wf.current_step
              const isCurrent = i === wf.current_step
              const isPending = i > wf.current_step

              return (
                <div key={i} className="flex items-center">
                  <div className="flex flex-col items-center" title={step?.action || stepLabel}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium ${
                      isComplete ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30' :
                      isCurrent ? 'bg-blue-400/20 text-blue-400 border border-blue-400/30 led-pulse' :
                      'bg-muted-foreground/10 text-muted-foreground/40 border border-border/30'
                    }`}>
                      {isComplete ? '✓' : i + 1}
                    </div>
                    <span className={`text-[8px] mt-0.5 max-w-12 text-center truncate ${
                      isCurrent ? 'text-blue-400' : isPending ? 'text-muted-foreground/40' : 'text-emerald-400/70'
                    }`}>
                      {stepLabel}
                    </span>
                  </div>
                  {i < wf.total_steps - 1 && (
                    <ArrowRight className={`w-3 h-3 mx-1 ${
                      isComplete ? 'text-emerald-400/40' : 'text-muted-foreground/20'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            title="Details"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          {(wf.status === 'running' || wf.status === 'waiting') && (
            <button
              onClick={() => onPause?.(wf.id)}
              className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              title="Pause workflow"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details — handoff reasons */}
      {showDetails && chain && (
        <div className="ml-7 bg-background/30 border border-border/20 rounded-lg px-3 py-2 space-y-2">
          <p className="text-[10px] text-muted-foreground">
            Updated {timeAgo(wf.updated_at)}
          </p>
          {chain.steps.map((step, i) => {
            const isComplete = i < wf.current_step
            const isCurrent = i === wf.current_step
            return (
              <div key={i} className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                  isComplete ? 'bg-emerald-400' : isCurrent ? 'bg-blue-400' : 'bg-muted-foreground/20'
                }`} />
                <div>
                  <span className={`text-[10px] font-medium ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Step {i + 1}: {ROLE_LABELS[step.role]}
                  </span>
                  <p className="text-[10px] text-muted-foreground/60">{step.action}</p>
                  {isComplete && i < wf.current_step && (
                    <p className="text-[10px] text-emerald-400/70">
                      Completed — output passed to {ROLE_LABELS[chain.steps[i + 1]?.role] || 'next step'}
                    </p>
                  )}
                  {isCurrent && wf.status === 'waiting' && (
                    <p className="text-[10px] text-amber-400/70">
                      Waiting — previous step output ready, awaiting agent launch
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
