'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useTasks, useRuns, useAgents } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import type { Task, Run, Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { StatusPill } from '@/components/ui/status-badge'
import { formatCost, timeAgo, cn } from '@/lib/utils'
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  MessageSquare,
  Clock,
  AlertTriangle,
  Filter,
  ChevronDown,
} from 'lucide-react'

type Decision = 'pending' | 'approved' | 'rejected'

interface ApprovalItem {
  id: string
  taskId: string
  title: string
  agentName: string
  agentColor: string
  model: string
  cost: number
  reason: string
  timestamp: string
  priority: string
  decision: Decision
  runId: string | null
}

function getApprovalItems(tasks: Task[], runs: Run[], agents: Agent[]): ApprovalItem[] {
  // Pending: tasks with needs_approval status
  const approvalTasks = tasks.filter(
    (t) => t.status === 'needs_approval'
  )
  const taskIds = new Set(approvalTasks.map((t) => t.id))

  // Also surface runs with needs_approval whose task isn't already listed
  const approvalRuns = runs.filter(
    (r) => r.status === 'needs_approval' && !taskIds.has(r.task_id)
  )

  const pending: ApprovalItem[] = approvalTasks.map((task) => {
    const agent = agents.find((a) => a.id === task.assigned_agent_id)
    const run = runs.find(
      (r) => r.task_id === task.id && r.status === 'needs_approval'
    )
    return {
      id: `approval-${task.id}`,
      taskId: task.id,
      title: task.title,
      agentName: agent?.name || 'Unknown',
      agentColor: agent?.avatar_color || '#71717a',
      model: run?.actual_model_used || 'unknown',
      cost: run?.estimated_cost || 0,
      reason:
        task.priority === 'critical'
          ? 'Critical priority task requires approval'
          : 'Budget threshold exceeded — estimated cost above agent limit',
      timestamp: task.updated_at,
      priority: task.priority,
      decision: 'pending',
      runId: run?.id || null,
    }
  })

  // Runs that need approval but have no matching task entry
  const runPending: ApprovalItem[] = approvalRuns.map((run) => {
    const agent = agents.find((a) => a.id === run.agent_id)
    return {
      id: `approval-run-${run.id}`,
      taskId: run.task_id,
      title: run.task_id || 'Agent action',
      agentName: agent?.name || 'Unknown',
      agentColor: agent?.avatar_color || '#71717a',
      model: run.actual_model_used || 'unknown',
      cost: run.estimated_cost || 0,
      reason: 'Agent action requires human approval',
      timestamp: run.started_at,
      priority: 'medium',
      decision: 'pending',
      runId: run.id,
    }
  })

  const completedTasks = tasks.filter((t) => t.status === 'completed').slice(0, 3)
  const history: ApprovalItem[] = completedTasks.map((task) => {
    const agent = agents.find((a) => a.id === task.assigned_agent_id)
    const run = runs.find((r) => r.task_id === task.id)
    return {
      id: `history-${task.id}`,
      taskId: task.id,
      title: task.title,
      agentName: agent?.name || 'Unknown',
      agentColor: agent?.avatar_color || '#71717a',
      model: run?.actual_model_used || 'unknown',
      cost: run?.estimated_cost || 0,
      reason: 'Completed within budget',
      timestamp: task.updated_at,
      priority: task.priority,
      decision: 'approved',
      runId: run?.id || null,
    }
  })

  return [...pending, ...runPending, ...history]
}

export default function ApprovalsPage() {
  const { activeProjectId } = useActiveProject()
  const { data: tasks } = useTasks(activeProjectId)
  const { data: runs } = useRuns(activeProjectId)
  const { data: agents } = useAgents()
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const items = getApprovalItems(tasks, runs, agents)

  const filtered = items.filter((item) => {
    const effectiveDecision = decisions[item.id] || item.decision
    if (filter === 'all') return true
    return effectiveDecision === filter
  })

  const pendingCount = items.filter(
    (i) => (decisions[i.id] || i.decision) === 'pending'
  ).length

  const handleDecision = (id: string, decision: Decision) => {
    setDecisions((prev) => ({ ...prev, [id]: decision }))
  }

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between section-header-fade pb-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-accent" />
              Approvals
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review agent actions that require human oversight. Decisions are tracked locally — writeback to OpenClaw requires the approval API.
            </p>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-status-approval/10 border border-status-approval/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-status-approval" />
              <span className="text-sm font-medium text-status-approval">
                {pendingCount} pending
              </span>
            </div>
          )}
        </header>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {(['all', 'pending', 'approved', 'rejected'] as const).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize',
                  filter === f
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                {f}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 text-xs bg-status-approval/20 text-status-approval px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          )}
        </div>

        {/* Approval Cards */}
        <div className="space-y-4">
          <AnimatePresence>
            {filtered.map((item, i) => {
              const effectiveDecision =
                decisions[item.id] || item.decision
              const isPending = effectiveDecision === 'pending'
              const isApproved = effectiveDecision === 'approved'
              const isRejected = effectiveDecision === 'rejected'

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    'bg-card border rounded-xl overflow-hidden card-glow transition-all',
                    isPending
                      ? 'border-status-approval/30 border-l-4 border-l-status-approval'
                      : isApproved
                        ? 'border-status-success/20 border-l-4 border-l-status-success opacity-70'
                        : 'border-status-failed/20 border-l-4 border-l-status-failed opacity-70'
                  )}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <AgentAvatar
                          name={item.agentName}
                          color={item.agentColor}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-foreground truncate">
                              {item.title}
                            </h3>
                            <StatusPill
                              status={
                                isPending
                                  ? 'needs_approval'
                                  : isApproved
                                    ? 'completed'
                                    : 'failed'
                              }
                              size="sm"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.agentName} ·{' '}
                            <span className="font-mono">
                              {item.model}
                            </span>{' '}
                            · {formatCost(item.cost)}
                          </p>

                          {/* Reason */}
                          <div className="mt-3 bg-background/50 border border-border/30 rounded-lg px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
                              Reason for Approval
                            </div>
                            <p className="text-xs text-foreground">
                              {item.reason}
                            </p>
                          </div>

                          {/* Metadata row */}
                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />{' '}
                              {timeAgo(item.timestamp)}
                            </span>
                            <span className="capitalize">
                              {item.priority} priority
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 shrink-0">
                        {isPending ? (
                          <>
                            <button
                              onClick={() =>
                                handleDecision(item.id, 'approved')
                              }
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-success/10 border border-status-success/20 text-status-success text-xs font-medium hover:bg-status-success/20 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                handleDecision(item.id, 'rejected')
                              }
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-failed/10 border border-status-failed/20 text-status-failed text-xs font-medium hover:bg-status-failed/20 transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                            {item.runId && (
                              <Link
                                href={`/runs/${item.runId}`}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-muted-foreground text-xs font-medium hover:bg-white/5 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" /> Inspect
                              </Link>
                            )}
                          </>
                        ) : (
                          <div
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                              isApproved
                                ? 'text-status-success'
                                : 'text-status-failed'
                            )}
                          >
                            {isApproved ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                                Approved
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5" />{' '}
                                Rejected
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">
                {items.length === 0
                  ? 'No approval requests yet'
                  : filter === 'pending'
                    ? 'No pending approvals'
                    : 'No approvals match this filter.'}
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                {items.length === 0
                  ? 'Approvals appear here when OpenClaw agents hit budget thresholds or need human sign-off.'
                  : 'Try changing your filter.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
