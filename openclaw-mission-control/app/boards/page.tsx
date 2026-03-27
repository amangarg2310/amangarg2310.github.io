'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTasks, useAgents } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { createTaskDraft } from '@/lib/api'
import { Task, Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn, timeAgo } from '@/lib/utils'
import {
  LayoutGrid,
  Plus,
  CheckCircle2,
  Circle,
  Loader2,
  Eye,
  RefreshCw,
  X,
} from 'lucide-react'

const BOARD_POLL_INTERVAL = 10_000

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

function TaskCard({ task, agents }: { task: Task; agents: Agent[] }) {
  const agent = agents.find((a) => a.id === task.assigned_agent_id)
  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-500',
    low: 'bg-zinc-500',
  }

  const isRecent = Date.now() - new Date(task.updated_at).getTime() < 2 * 60 * 1000
  const isFailed = task.status === 'failed'

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
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {task.description}
        </p>
      )}

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

/** Inline quick-add form for creating tasks directly on the board */
function QuickAddTask({
  projectId,
  onCreated,
  onCancel,
}: {
  projectId: string | null
  onCreated: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim() || !projectId) return
    setSaving(true)
    try {
      await createTaskDraft({
        goal: title.trim(),
        project_id: projectId,
        priority: 'medium',
      })
      setTitle('')
      onCreated()
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-accent/30 rounded-lg p-3 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Task title..."
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Enter to save, Esc to cancel</span>
        <div className="flex gap-1">
          <button onClick={onCancel} className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || saving || !projectId}
            className="text-[10px] bg-accent text-white px-2 py-1 rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BoardsPage() {
  const { activeProjectId } = useActiveProject()
  const { data: tasks, lastFetchedAt } = useTasks(activeProjectId, BOARD_POLL_INTERVAL)
  const { data: agents } = useAgents()
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Tick every 5s so the "refreshed X ago" label stays fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

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
              <span>Task board for your agent fleet</span>
            )}
            {lastFetchedAt && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <RefreshCw className="w-2.5 h-2.5" />
                {lastRefreshLabel(lastFetchedAt)}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setAddingToColumn('backlog')}
          className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </header>

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
                  {/* Quick-add form if this column is targeted */}
                  {addingToColumn === column.id && (
                    <QuickAddTask
                      projectId={activeProjectId}
                      onCreated={() => {
                        setAddingToColumn(null)
                        setRefreshKey(k => k + 1)
                      }}
                      onCancel={() => setAddingToColumn(null)}
                    />
                  )}

                  {columnTasks.length > 0 ? (
                    columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} agents={agents} />
                    ))
                  ) : addingToColumn !== column.id ? (
                    <div className="flex flex-col items-center justify-center h-24 gap-1">
                      <span className="text-xs text-muted-foreground/50">No tasks</span>
                    </div>
                  ) : null}

                  {/* Add task button at bottom (only for backlog column) */}
                  {column.id === 'backlog' && addingToColumn !== column.id && (
                    <button
                      onClick={() => setAddingToColumn(column.id)}
                      className="w-full py-2 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/5 transition-all flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add task
                    </button>
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
