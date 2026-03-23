'use client'

import { runs, agents } from '@/lib/mock-data'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDuration } from '@/lib/utils'
import { motion } from 'framer-motion'
import Link from 'next/link'

export function RunStatusBoard() {
  const activeRuns = runs.filter((r) =>
    ['running', 'stalled', 'needs_approval', 'failed', 'completed'].includes(
      r.status
    )
  ).slice(0, 5)

  return (
    <motion.section
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 }}
      className="space-y-4"
    >
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider section-header-fade">
        Active Runs
      </h2>
      <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden card-glow h-[340px]">
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeRuns.map((run) => {
            const agent = agents.find((a) => a.id === run.agent_id)
            const progress =
              run.status === 'completed'
                ? 100
                : run.status === 'running'
                  ? 65
                  : run.status === 'needs_approval'
                    ? 90
                    : run.status === 'failed'
                      ? 10
                      : 30
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
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={statusKey} size="sm" />
                    <span className="text-sm font-medium text-foreground">
                      {agent?.name || run.agent_name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {formatDuration(run.started_at, run.ended_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono">
                    {run.id.slice(0, 10)}
                  </span>
                  <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        run.status === 'failed'
                          ? 'bg-status-failed'
                          : run.status === 'needs_approval'
                            ? 'bg-status-approval'
                            : 'bg-accent'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </motion.section>
  )
}
