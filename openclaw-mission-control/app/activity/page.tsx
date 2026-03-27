'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useRuns, useAgents, useTasks } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import type { Run, Agent, Task, RunEvent } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { formatCost, timeAgo, cn } from '@/lib/utils'
import {
  Activity,
  Zap,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Bot,
  Search,
  Filter,
  Wrench,
  User,
} from 'lucide-react'

type ActivityType = 'all' | 'agent' | 'tool' | 'system' | 'error'

interface ActivityEntry {
  id: string
  type: ActivityType
  title: string
  description: string
  agentName: string | null
  agentColor: string | null
  timestamp: string
  cost: number | null
  icon: React.ElementType
  colorClass: string
}

function buildActivityLog(runs: Run[], agents: Agent[], tasks: Task[], runEvents: RunEvent[]): ActivityEntry[] {
  const entries: ActivityEntry[] = []

  // From runs
  for (const run of runs) {
    const agent = agents.find((a) => a.id === run.agent_id)
    const task = tasks.find((t) => t.id === run.task_id)

    entries.push({
      id: `run-start-${run.id}`,
      type: 'agent',
      title: `${agent?.name || 'Agent'} started: ${task?.title || run.task_title}`,
      description: `Model: ${run.actual_model_used}`,
      agentName: agent?.name || null,
      agentColor: agent?.avatar_color || null,
      timestamp: run.started_at,
      cost: null,
      icon: Zap,
      colorClass: 'bg-status-running/10 border-status-running/20 text-status-running',
    })

    if (run.status === 'completed' && run.ended_at) {
      entries.push({
        id: `run-end-${run.id}`,
        type: 'agent',
        title: `${agent?.name || 'Agent'} completed: ${task?.title || run.task_title}`,
        description: `${run.input_tokens + run.output_tokens} tokens · ${formatCost(run.estimated_cost)}`,
        agentName: agent?.name || null,
        agentColor: agent?.avatar_color || null,
        timestamp: run.ended_at,
        cost: run.estimated_cost,
        icon: CheckCircle2,
        colorClass: 'bg-status-success/10 border-status-success/20 text-status-success',
      })
    }

    if (run.status === 'failed' && run.ended_at) {
      entries.push({
        id: `run-fail-${run.id}`,
        type: 'error',
        title: `${agent?.name || 'Agent'} failed: ${task?.title || run.task_title}`,
        description: `${run.retry_count} retries exhausted`,
        agentName: agent?.name || null,
        agentColor: agent?.avatar_color || null,
        timestamp: run.ended_at,
        cost: run.estimated_cost,
        icon: AlertTriangle,
        colorClass: 'bg-status-failed/10 border-status-failed/20 text-status-failed',
      })
    }

    if (run.status === 'needs_approval') {
      entries.push({
        id: `run-approval-${run.id}`,
        type: 'system',
        title: `Approval required: ${task?.title || run.task_title}`,
        description: `${agent?.name || 'Agent'} paused — awaiting human review`,
        agentName: agent?.name || null,
        agentColor: agent?.avatar_color || null,
        timestamp: run.started_at,
        cost: run.estimated_cost,
        icon: Clock,
        colorClass: 'bg-status-approval/10 border-status-approval/20 text-status-approval',
      })
    }
  }

  // From tool events
  for (const event of runEvents.filter((e) => e.event_type === 'tool_call')) {
    const run = runs.find((r) => r.id === event.run_id)
    const agent = run ? agents.find((a) => a.id === run.agent_id) : null

    entries.push({
      id: `event-${event.id}`,
      type: 'tool',
      title: `Tool: ${event.tool_name || 'unknown'}`,
      description: event.summary,
      agentName: agent?.name || null,
      agentColor: agent?.avatar_color || null,
      timestamp: event.timestamp,
      cost: event.estimated_cost,
      icon: Terminal,
      colorClass: 'bg-status-tool/10 border-status-tool/20 text-status-tool',
    })
  }

  return entries.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

export default function ActivityPage() {
  const { activeProjectId } = useActiveProject()
  const { data: runs } = useRuns(activeProjectId)
  const { data: agents } = useAgents()
  const { data: tasks } = useTasks(activeProjectId)
  const [filter, setFilter] = useState<ActivityType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  // Tool-level events loaded per-run in detail view; activity page uses run-level entries
  const allEntries = buildActivityLog(runs, agents, tasks, [])

  const filtered = allEntries.filter((entry) => {
    if (filter !== 'all' && entry.type !== filter) return false
    if (
      searchQuery &&
      !entry.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !entry.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false
    return true
  })

  const filterButtons: { id: ActivityType; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: 'All', icon: Activity },
    { id: 'agent', label: 'Agent', icon: Bot },
    { id: 'tool', label: 'Tools', icon: Wrench },
    { id: 'system', label: 'System', icon: Clock },
    { id: 'error', label: 'Errors', icon: AlertTriangle },
  ]

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="section-header-fade pb-2">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-accent" />
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Timeline of agent runs and task status changes from OpenClaw sync.
          </p>
        </header>

        {/* Search + Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activity..."
              className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex items-center gap-1">
            {filterButtons.map((btn) => {
              const Icon = btn.icon
              return (
                <button
                  key={btn.id}
                  onClick={() => setFilter(btn.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    filter === btn.id
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {btn.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

          <div className="space-y-1">
            {filtered.map((entry, i) => {
              // Date header: show when date changes from previous entry
              const entryDate = new Date(entry.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
              const prevDate = i > 0 ? new Date(filtered[i - 1].timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : null
              const showDateHeader = i === 0 || entryDate !== prevDate

              // Extract run ID from entry ID pattern like "run-start-xxx" or "run-end-xxx"
              const runIdMatch = entry.id.match(/^run-(?:start|end|fail|approval)-(.+)$/)
              const runId = runIdMatch?.[1]

              return (
                <div key={entry.id}>
                  {showDateHeader && (
                    <div className="flex items-center gap-3 py-3 pl-1">
                      <div className="w-10 flex items-center justify-center z-10">
                        <div className="w-2 h-2 rounded-full bg-border" />
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {entryDate}
                      </span>
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.5) }}
                    className="flex items-start gap-4 py-3 px-1 hover:bg-white/[0.02] rounded-lg transition-colors relative group"
                  >
                    {/* Icon dot */}
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center border shrink-0 z-10 bg-background',
                        entry.colorClass
                      )}
                    >
                      <entry.icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2">
                        {entry.agentName && entry.agentColor && (
                          <AgentAvatar
                            name={entry.agentName}
                            color={entry.agentColor}
                            size="sm"
                          />
                        )}
                        {runId ? (
                          <Link href={`/runs/${runId}`} className="text-sm font-medium text-foreground truncate hover:text-accent transition-colors">
                            {entry.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-foreground truncate">
                            {entry.title}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.description}
                      </p>
                    </div>

                    {/* Right: time + cost */}
                    <div className="text-right shrink-0 pt-1">
                      <div className="text-xs text-muted-foreground font-mono tabular-nums">
                        {timeAgo(entry.timestamp)}
                      </div>
                      {entry.cost !== null && (
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          Est. {formatCost(entry.cost)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">
                {allEntries.length === 0
                  ? 'No activity yet — events appear here as OpenClaw agents run tasks.'
                  : 'No activity matches your filters.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
