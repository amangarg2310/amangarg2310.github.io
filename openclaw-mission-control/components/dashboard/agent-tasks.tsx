'use client'

import { useTasks, useAgents } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { StatusBadge } from '@/components/ui/status-badge'
import { timeAgo } from '@/lib/utils'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Bot } from 'lucide-react'

export function AgentTasks() {
  const { activeProjectId } = useActiveProject()
  const { data: tasks } = useTasks(activeProjectId)
  const { data: agents } = useAgents()

  // Show most recent tasks created by agents (created_by = 'agent'), newest first
  const agentTasks = tasks
    .filter((t) => t.created_by === 'agent')
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 8)

  // Also show backlog tasks (queued status) that may not have created_by=agent
  const backlogTasks = tasks
    .filter((t) => t.status === 'queued')
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 8)

  // Merge: agent-created tasks + backlog tasks, deduplicated, max 8
  const seen = new Set<string>()
  const merged = [...agentTasks, ...backlogTasks].filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  }).slice(0, 8)

  if (merged.length === 0) return null

  const priorityColor: Record<string, string> = {
    critical: 'text-red-400',
    high: 'text-amber-400',
    medium: 'text-blue-400',
    low: 'text-muted-foreground',
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider section-header-fade">
          Agent-Created Tasks
        </h2>
        <Link
          href="/boards"
          className="text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
        >
          View Backlog &rarr;
        </Link>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden card-glow">
        <div className="divide-y divide-border/50">
          {merged.map((task) => {
            const agent = agents.find((a) => a.id === task.assigned_agent_id)
            const statusKey =
              task.status === 'completed'
                ? 'success'
                : task.status === 'needs_approval'
                  ? 'approval'
                  : task.status

            return (
              <Link
                key={task.id}
                href="/boards"
                className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge status={statusKey} size="sm" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground block truncate">
                      {task.title}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {agent && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          {agent.name}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-medium ${priorityColor[task.priority] || 'text-muted-foreground'}`}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0 ml-4">
                  {timeAgo(task.created_at)}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </motion.section>
  )
}
