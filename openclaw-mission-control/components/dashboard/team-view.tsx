'use client'

import { useRuns, useAgents, useTasks } from '@/lib/hooks'
import { StatusBadge } from '@/components/ui/status-badge'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { formatCost } from '@/lib/utils'
import { motion } from 'framer-motion'
import Link from 'next/link'

function PipelineEdge({ active = false }: { active?: boolean }) {
  return (
    <div className="flex-1 h-14 flex items-center justify-center -mx-2 z-0 relative">
      <svg
        className="w-full h-8 overflow-visible"
        preserveAspectRatio="none"
      >
        <path
          d="M 0,16 C 20,16 30,16 50,16"
          stroke={active ? '#3b82f6' : '#252528'}
          strokeWidth="2"
          fill="none"
          className={active ? 'animate-flow' : ''}
          strokeDasharray={active ? '4 4' : 'none'}
        />
        <circle
          cx="50"
          cy="16"
          r="3"
          fill={active ? '#3b82f6' : '#252528'}
        />
      </svg>
    </div>
  )
}

export function TeamView() {
  const { data: runs } = useRuns()
  const { data: agents } = useAgents()
  const { data: tasks } = useTasks()
  const activeTaskIds = [
    ...new Set(
      runs
        .filter((r) =>
          ['running', 'needs_approval'].includes(r.status)
        )
        .map((r) => r.task_id)
    ),
  ]

  const taskGroups = activeTaskIds
    .map((taskId) => {
      const task = tasks.find((t) => t.id === taskId)
      const taskRuns = runs.filter((r) => r.task_id === taskId)
      const involvedAgentIds = [
        ...new Set(taskRuns.map((r) => r.agent_id)),
      ]
      const involvedAgents = involvedAgentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter(Boolean)
      const totalCost = taskRuns.reduce(
        (sum, r) => sum + r.estimated_cost,
        0
      )
      return { task, runs: taskRuns, agents: involvedAgents, totalCost }
    })
    .filter((g) => g.task)

  if (taskGroups.length === 0) return null

  const pipelineAgents = taskGroups[0]?.agents || []

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="space-y-4"
    >
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider section-header-fade">
        Active Agent Teams
      </h2>
      <div className="bg-card border border-border rounded-xl p-8 card-glow overflow-x-auto">
        <div className="flex items-center justify-between min-w-[600px] max-w-4xl mx-auto">
          {pipelineAgents.map((agent, i) => {
            if (!agent) return null
            const run = taskGroups[0]?.runs.find(
              (r) => r.agent_id === agent.id
            )
            const statusKey =
              run?.status === 'completed'
                ? 'success'
                : run?.status === 'needs_approval'
                  ? 'approval'
                  : run?.status || 'queued'

            return (
              <div key={agent.id} className="contents">
                {i > 0 && (
                  <PipelineEdge
                    active={
                      run?.status === 'running' ||
                      run?.status === 'completed'
                    }
                  />
                )}
                <Link href={run ? `/runs/${run.id}` : '/runs'}>
                  <div className="flex flex-col items-center gap-3 z-10">
                    <div className="relative">
                      <AgentAvatar
                        name={agent.name}
                        color={agent.avatar_color}
                        size="lg"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                        <StatusBadge status={statusKey} size="sm" />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {agent.name}
                    </span>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
        <div className="text-center mt-4 text-xs text-muted-foreground">
          {taskGroups[0]?.task?.title} ·{' '}
          {formatCost(taskGroups[0]?.totalCost || 0)}
        </div>
      </div>
    </motion.section>
  )
}
