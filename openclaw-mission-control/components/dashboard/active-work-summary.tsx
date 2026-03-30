'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Plus, ArrowRight, Zap, Clock, ShieldAlert, AlertTriangle } from 'lucide-react'
import { useDashboardStats, useConversations, useProjects } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { formatCost } from '@/lib/utils'

export function ActiveWorkSummary() {
  const { activeProjectId } = useActiveProject()
  const { activeRuns, failedRuns, queuedTasks, needsApproval, todayUsage: today } = useDashboardStats(activeProjectId)
  const { data: conversations } = useConversations(activeProjectId)
  const { data: projects } = useProjects()

  const activeConversations = conversations.filter((c) => c.status === 'active')
  const firstProjectId = projects.length > 0 ? projects[0].id : null

  // Build summary parts (only non-zero items)
  const parts: string[] = []
  if (activeRuns.length > 0) parts.push(`${activeRuns.length} agent${activeRuns.length > 1 ? 's' : ''} running`)
  if (activeConversations.length > 0) parts.push(`${activeConversations.length} active conversation${activeConversations.length > 1 ? 's' : ''}`)
  if (queuedTasks.length > 0) parts.push(`${queuedTasks.length} task${queuedTasks.length > 1 ? 's' : ''} queued`)
  if (needsApproval.length > 0) parts.push(`${needsApproval.length} awaiting approval`)
  if (today.cost > 0) parts.push(`${formatCost(today.cost)} spent today`)

  const isIdle = parts.length === 0
  const summary = isIdle
    ? 'All quiet — open a project to start a conversation.'
    : parts.join(' · ')

  const pills = [
    { label: 'Running', count: activeRuns.length, color: 'bg-status-running/20 text-status-running', icon: Zap },
    { label: 'Queued', count: queuedTasks.length, color: 'bg-status-approval/20 text-status-approval', icon: Clock },
    { label: 'Approval', count: needsApproval.length, color: 'bg-status-approval/20 text-status-approval', icon: ShieldAlert },
    { label: 'Failed', count: failedRuns.length, color: 'bg-status-failed/20 text-status-failed', icon: AlertTriangle },
  ].filter((p) => p.count > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card border border-border rounded-xl px-5 py-3.5 card-glow"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: summary + pills */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${isIdle ? 'bg-muted-foreground/40' : 'bg-status-running led-pulse'}`}
          />
          <span className="text-sm text-muted-foreground truncate">
            {summary}
          </span>
          {pills.length > 0 && (
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {pills.map((pill) => {
                const Icon = pill.icon
                return (
                  <span
                    key={pill.label}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${pill.color}`}
                  >
                    <Icon className="w-3 h-3" />
                    {pill.count} {pill.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: quick actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
          </Link>
          {firstProjectId && (
            <Link
              href={`/projects/${firstProjectId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            >
              Open Workspace
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  )
}
