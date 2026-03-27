'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTasks, useAgents } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { Task, Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { cn, timeAgo } from '@/lib/utils'
import {
  LayoutGrid,
  Plus,
  GripVertical,
  CheckCircle2,
  Circle,
  Loader2,
  Eye,
  RefreshCw,
} from 'lucide-react'

const BOARD_POLL_INTERVAL = 15_000 // 15 seconds

type KanbanColumn = {
  id: string
  title: string
  statuses: string[]
  color: string
  icon: React.ElementType
}

const columns: KanbanColumn[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    statuses: ['queued'],
    color: '#71717a',
    icon: Circle,
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    statuses: ['running', 'waiting'],
    color: '#3b82f6',
    icon: Loader2,
  },
  {
    id: 'review',
    title: 'Review',
    statuses: ['needs_approval', 'stalled'],
    color: '#f59e0b',
    icon: Eye,
  },
  {
    id: 'done',
    title: 'Done',
    statuses: ['completed', 'failed'],
    color: '#10b981',
    icon: CheckCircle2,
  },
]

function TaskCard({ task, agents }: { task: Task; agents: Agent[] }) {
  const agent = agents.find((a) => a.id === task.assigned_agent_id)
  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-500',
    low: 'bg-zinc-500',
  }

  // Highlight cards updated within the last 2 minutes
  const isRecent = Date.now() - new Date(task.updated_at).getTime() < 2 * 60 * 1000

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'bg-card border rounded-lg p-3 card-glow hover:card-hover transition-all cursor-grab active:cursor-grabbing group',
        isRecent ? 'border-accent/40' : 'border-border/50',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground leading-snug line-clamp-2">
          {task.title}
        </h4>
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {agent && (
            <AgentAvatar
              name={agent.name}
              color={agent.avatar_color}
              size="sm"
            />
          )}
          <span className="text-[10px] text-muted-foreground">
            {agent?.name || 'Unassigned'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              priorityColors[task.priority]
            )}
            title={task.priority}
          />
          <span className={cn('text-[10px]', isRecent ? 'text-accent' : 'text-muted-foreground')}>
            {timeAgo(task.updated_at)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

/** Formats elapsed seconds since last fetch as "Xm Xs ago" or "just now" */
function lastRefreshLabel(lastFetchedAt: number | null): string {
  if (!lastFetchedAt) return ''
  const elapsed = Math.floor((Date.now() - lastFetchedAt) / 1000)
  if (elapsed < 5) return 'just now'
  if (elapsed < 60) return `${elapsed}s ago`
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return s > 0 ? `${m}m ${s}s ago` : `${m}m ago`
}

export default function BoardsPage() {
  const { activeProjectId } = useActiveProject()
  const { data: tasks, lastFetchedAt } = useTasks(activeProjectId, BOARD_POLL_INTERVAL)
  const { data: agents } = useAgents()

  // Tick every 5s so the "refreshed X ago" label stays fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex-1 h-screen overflow-hidden bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-accent" />
            Boards
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            Kanban view of all tasks across your agent fleet.
            {lastFetchedAt && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <RefreshCw className="w-2.5 h-2.5 animate-none" />
                Refreshed {lastRefreshLabel(lastFetchedAt)}
              </span>
            )}
          </p>
        </div>
        <button className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </header>

      {/* Kanban Board */}
      {/*
        Layout strategy:
        - Outer: flex-1 + overflow-x-auto handles horizontal scroll when columns don't fit
        - Inner: inline-flex (not flex) so it only takes up as much width as content needs,
          allowing overflow-x-auto to kick in at narrow widths without stretching columns
        - Each column: fixed min-width of 280px, max 360px, uses flex-shrink-0 to not compress
      */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-8">
        <div className="inline-flex gap-5 h-full align-top">
          {columns.map((column) => {
            const columnTasks = tasks.filter((t) =>
              column.statuses.includes(t.status)
            )
            const Icon = column.icon

            return (
              <div
                key={column.id}
                className="w-[300px] flex flex-col shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center gap-2 mb-4 px-1">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{
                      backgroundColor: `${column.color}15`,
                      color: column.color,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    {column.title}
                  </h3>
                  <span className="text-xs text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Column Drop Zone */}
                <div className="flex-1 bg-white/[0.01] border border-dashed border-border/50 rounded-xl p-3 space-y-3 overflow-y-auto min-h-0">
                  {columnTasks.length > 0 ? (
                    columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} agents={agents} />
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-24 gap-1">
                      <span className="text-xs text-muted-foreground/50">No tasks</span>
                      <span className="text-[10px] text-muted-foreground/30">Tasks appear here as agents create them</span>
                    </div>
                  )}

                  {/* Add task button at bottom */}
                  <button className="w-full py-2 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/5 transition-all flex items-center justify-center gap-1">
                    <Plus className="w-3 h-3" /> Add task
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
