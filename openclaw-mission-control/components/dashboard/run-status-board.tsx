'use client'

import { useRuns, useAgents } from '@/lib/hooks'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDuration, formatCost } from '@/lib/utils'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Activity } from 'lucide-react'

export function RunStatusBoard() {
  const { data: runs } = useRuns()
  const { data: agents } = useAgents()
  const recentRuns = runs
    .filter((r) =>
      ['running', 'idle', 'stalled', 'needs_approval', 'failed', 'completed'].includes(r.status)
    )
    .slice(0, 6)

  return (
    <motion.section
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 }}
      className="space-y-4"
    >
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider section-header-fade">
        Recent Runs
      </h2>
      <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden card-glow h-[340px]">
        {recentRuns.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <Activity className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No runs yet</p>
            <p className="text-xs text-muted-foreground/50">
              Runs appear here as agents execute tasks.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {recentRuns.map((run) => {
              const agent = agents.find((a) => a.id === run.agent_id)
              const statusKey =
                run.status === 'completed'
                  ? 'success'
                  : run.status === 'needs_approval'
                    ? 'approval'
                    : run.status

              return (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="group flex flex-col p-3 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer border border-transparent hover:border-white/5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={statusKey} size="sm" />
                      <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                        {run.task_title || agent?.name || run.agent_name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums">
                      {formatDuration(run.started_at, run.ended_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{agent?.name || run.agent_name}</span>
                    <span className="font-mono tabular-nums">
                      {formatCost(run.estimated_cost)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </motion.section>
  )
}
