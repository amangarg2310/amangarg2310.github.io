'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTasks, useAgents, useProjects } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { updateTaskStatus as apiUpdateTaskStatus } from '@/lib/api'
import { Task, Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn, timeAgo } from '@/lib/utils'
import {
  LayoutGrid,
  CheckCircle2,
  Circle,
  Loader2,
  Eye,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Bot,
  User as UserIcon,
  Info,
  X,
  FolderKanban,
  ChevronDown,
} from 'lucide-react'
import { Project, Task } from '@/lib/types'

const BOARD_POLL_INTERVAL = 10_000

const COLUMN_EMPTY_HINTS: Record<string, string> = {
  backlog: 'Tasks appear here when agents identify work during conversations',
  'in-progress': 'Promote tasks from Backlog when ready to start',
  review: 'Tasks waiting for your review or approval',
  done: 'Completed and closed tasks',
}

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
    statuses: ['completed', 'failed', 'paused'],
    color: '#10b981',
    icon: CheckCircle2,
  },
]

// Map column transitions for promote/demote
const PROMOTE_STATUS: Record<string, string> = {
  queued: 'running',        // Backlog → In Progress
  running: 'needs_approval', // In Progress → Review
  waiting: 'needs_approval',
  needs_approval: 'completed', // Review → Done
  stalled: 'completed',
}
const DEMOTE_STATUS: Record<string, string> = {
  running: 'queued',        // In Progress → Backlog
  waiting: 'queued',
  needs_approval: 'running', // Review → In Progress
  stalled: 'running',
  completed: 'needs_approval', // Done → Review
  failed: 'queued',         // Failed → Backlog (retry)
}

function TaskCard({
  task,
  agents,
  onPromote,
  onDemote,
}: {
  task: Task
  agents: Agent[]
  onPromote?: () => void
  onDemote?: () => void
}) {
  const agent = agents.find((a) => a.id === task.assigned_agent_id)
  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-500',
    low: 'bg-zinc-500',
  }

  const isRecent = Date.now() - new Date(task.updated_at).getTime() < 2 * 60 * 1000
  const isFailed = task.status === 'failed'
  const isAgentCreated = task.created_by === 'agent'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'bg-card border rounded-lg p-3 card-glow hover:card-hover transition-all group',
        isRecent ? 'border-accent/40' : isFailed ? 'border-red-500/30' : 'border-border/50',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground leading-snug line-clamp-2">
          {task.title}
        </h4>
        <StatusBadge status={task.status} />
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {task.description}
        </p>
      )}

      {/* Task origin badge */}
      <div className="flex items-center gap-1 mb-3">
        {isAgentCreated ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">
            <Bot className="w-2.5 h-2.5" /> Agent identified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-white/5 px-1.5 py-0.5 rounded">
            <UserIcon className="w-2.5 h-2.5" /> Manual
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {agent && (
            <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
          )}
          <span className="text-[10px] text-muted-foreground">
            {agent?.name || 'Unassigned'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn('w-1.5 h-1.5 rounded-full', priorityColors[task.priority])}
            title={task.priority}
          />
          <span className={cn('text-[10px]', isRecent ? 'text-accent' : 'text-muted-foreground')}>
            {timeAgo(task.updated_at)}
          </span>
        </div>
      </div>

      {/* Promote / Demote buttons — visible on hover */}
      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onDemote && DEMOTE_STATUS[task.status] && (
          <button
            onClick={onDemote}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
            title="Move back"
          >
            <ArrowLeft className="w-2.5 h-2.5" /> Back
          </button>
        )}
        {onPromote && PROMOTE_STATUS[task.status] && (
          <button
            onClick={onPromote}
            className="flex items-center gap-1 text-[10px] text-accent hover:text-white px-2 py-1 rounded bg-accent/10 hover:bg-accent/30 transition-colors ml-auto"
            title="Promote forward"
          >
            Promote <ArrowRight className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </motion.div>
  )
}

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
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: tasks, lastFetchedAt } = useTasks(activeProjectId, BOARD_POLL_INTERVAL, refreshKey)
  const { data: agents } = useAgents()

  // Tick every 5s so the "refreshed X ago" label stays fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await apiUpdateTaskStatus(taskId, newStatus)
      setRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to update task status:', err)
    }
  }

  const totalTasks = tasks.length
  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'waiting').length

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
            {totalTasks > 0 ? (
              <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}{activeTasks > 0 ? ` · ${activeTasks} active` : ''}</span>
            ) : (
              <span>Tasks appear here as agents identify work from conversations</span>
            )}
            {lastFetchedAt && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <RefreshCw className="w-2.5 h-2.5" />
                {lastRefreshLabel(lastFetchedAt)}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Info banner */}
      {!bannerDismissed && (
        <div className="mx-8 mb-4 flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-2.5">
          <Info className="w-4 h-4 text-accent shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Tasks are created by agents during conversations. Use the <strong className="text-foreground">Promote</strong> button to move tasks to In Progress.
          </p>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-8">
        <div className="inline-flex gap-5 h-full align-top">
          {columns.map((column) => {
            const columnTasks = tasks
              .filter((t) => column.statuses.includes(t.status))
              .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            const Icon = column.icon

            return (
              <div key={column.id} className="w-[300px] flex flex-col shrink-0">
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
                  <h3 className="text-sm font-medium text-foreground">{column.title}</h3>
                  <span className="text-xs text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Column Body */}
                <div className="flex-1 bg-white/[0.01] border border-dashed border-border/50 rounded-xl p-3 space-y-3 overflow-y-auto min-h-0">
                  {columnTasks.length > 0 ? (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        agents={agents}
                        onPromote={PROMOTE_STATUS[task.status] ? () => handleStatusChange(task.id, PROMOTE_STATUS[task.status]) : undefined}
                        onDemote={DEMOTE_STATUS[task.status] ? () => handleStatusChange(task.id, DEMOTE_STATUS[task.status]) : undefined}
                      />
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
                      <Icon className="w-5 h-5 text-muted-foreground/30" />
                      <span className="text-xs text-muted-foreground/50 leading-relaxed">
                        {COLUMN_EMPTY_HINTS[column.id]}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
