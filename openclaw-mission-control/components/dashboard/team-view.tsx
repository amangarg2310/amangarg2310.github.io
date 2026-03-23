'use client'

import { useRuns, useAgents, useTasks } from '@/lib/hooks'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCost } from '@/lib/utils'
import { Search, Database, PenTool, Terminal } from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'

const agentIcons: Record<string, React.ElementType> = {
  Researcher: Search,
  'Data Analyst': Database,
  Writer: PenTool,
  Reviewer: Terminal,
}

const agentColors: Record<string, string> = {
  Researcher: '#10b981',
  'Data Analyst': '#3b82f6',
  Writer: '#f59e0b',
  Reviewer: '#a855f7',
}

function PipelineNode({
  name,
  icon: Icon,
  status,
  color,
}: {
  name: string
  icon: React.ElementType
  status: string
  color: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 z-10">
      <div className="w-14 h-14 rounded-2xl bg-card border border-border card-glow flex items-center justify-center relative group hover:border-accent/50 transition-colors duration-300">
        <div
          className="absolute inset-0 rounded-2xl opacity-10"
          style={{ backgroundColor: color }}
        />
        <Icon className="w-6 h-6" style={{ color }} />
        <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
          <StatusBadge
            status={
              status === 'completed'
                ? 'success'
                : status === 'running'
                  ? 'running'
                  : status === 'needs_approval'
                    ? 'approval'
                    : 'queued'
            }
            size="sm"
          />
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{name}</span>
    </div>
  )
}

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

  // Build pipeline from involved agents
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
            const name = agent.name
            const run = taskGroups[0]?.runs.find(
              (r) => r.agent_id === agent.id
            )
            const Icon = agentIcons[name] || Terminal
            const color = agentColors[name] || agent.avatar_color

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
                  <PipelineNode
                    name={name}
                    icon={Icon}
                    status={run?.status || 'queued'}
                    color={color}
                  />
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
