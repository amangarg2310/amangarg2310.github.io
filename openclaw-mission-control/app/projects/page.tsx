'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useProjects, useProjectContext, useAgents } from '@/lib/hooks'
import { createProject, deleteProject } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import type { Agent } from '@/lib/types'
import {
  FolderKanban,
  Activity,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
  Trash2,
  Bot,
} from 'lucide-react'

const PROJECT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

function getHealthStatus(context: { blockedCount: number; activeRunCount: number; taskCount: number }): { color: string; label: string; dot: string } {
  if (context.blockedCount > 0) {
    return { color: 'text-red-400', label: 'Blocked', dot: 'bg-red-400' }
  }
  if (context.activeRunCount > 0) {
    return { color: 'text-emerald-400', label: 'All good', dot: 'bg-emerald-400' }
  }
  if (context.taskCount > 0) {
    return { color: 'text-amber-400', label: 'Needs attention', dot: 'bg-amber-400' }
  }
  return { color: 'text-emerald-400', label: 'All good', dot: 'bg-emerald-400' }
}

function ProjectCard({ projectId, delay, onDelete, agents }: { projectId: string; delay: number; onDelete: (id: string) => void; agents: Agent[] }) {
  const { data: context } = useProjectContext(projectId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!context) return null

  const { project, taskCount, activeRunCount, recentConversationCount, blockedCount, queuedCount, completedCount, lastActivityAt } = context
  const health = getHealthStatus({ blockedCount, activeRunCount, taskCount })
  const primaryAgent = project.primary_agent_id ? agents.find((a) => a.id === project.primary_agent_id) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="relative"
    >
      <Link
        href={`/projects/${project.id}`}
        className="block bg-card border border-border rounded-xl p-5 card-glow hover:card-hover transition-all group"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: project.color + '20', color: project.color }}
              >
                {project.name[0]}
              </div>
              {/* Health indicator dot */}
              <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-card ${health.dot}`} title={health.label} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                {project.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {project.description || 'No description'}
              </p>
            </div>
          </div>
        </div>

        {/* Primary agent */}
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-background/50 border border-border/30 rounded-lg">
          {primaryAgent ? (
            <>
              <AgentAvatar name={primaryAgent.name} color={primaryAgent.avatar_color} size="sm" />
              <span className="text-[10px] text-foreground/70 truncate">
                <span className="text-muted-foreground">Primary:</span> {primaryAgent.name}
              </span>
              <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${primaryAgent.is_active ? 'bg-status-running led-pulse' : 'bg-muted-foreground/30'}`} />
            </>
          ) : (
            <>
              <Bot className="w-3.5 h-3.5 text-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground/40 italic">No primary agent</span>
            </>
          )}
        </div>

        {/* Status breakdown bar */}
        {taskCount > 0 && (
          <div className="flex items-center gap-1 mb-3">
            {activeRunCount > 0 && (
              <div
                className="h-1.5 rounded-full bg-status-running"
                style={{ flex: activeRunCount }}
                title={`${activeRunCount} active`}
              />
            )}
            {blockedCount > 0 && (
              <div
                className="h-1.5 rounded-full bg-status-approval"
                style={{ flex: blockedCount }}
                title={`${blockedCount} blocked`}
              />
            )}
            {queuedCount > 0 && (
              <div
                className="h-1.5 rounded-full bg-muted-foreground/30"
                style={{ flex: queuedCount }}
                title={`${queuedCount} queued`}
              />
            )}
            {completedCount > 0 && (
              <div
                className="h-1.5 rounded-full bg-status-success"
                style={{ flex: completedCount }}
                title={`${completedCount} completed`}
              />
            )}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {taskCount} tasks
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" /> {activeRunCount} active
          </span>
          {blockedCount > 0 && (
            <span className="flex items-center gap-1 text-status-approval">
              <AlertTriangle className="w-3 h-3" /> {blockedCount} blocked
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> {recentConversationCount} conversations
          </span>
        </div>
        {lastActivityAt && (
          <div className="mt-2 text-[10px] text-muted-foreground/50">
            Last activity {timeAgo(lastActivityAt)}
          </div>
        )}
      </Link>

      {/* Delete button */}
      <button
        onClick={(e) => { e.preventDefault(); setConfirmDelete(true) }}
        className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground/30 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        title="Delete project"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 z-10 bg-card/95 border border-red-500/20 rounded-xl flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
          <p className="text-sm text-foreground font-medium">Delete &ldquo;{project.name}&rdquo;?</p>
          <p className="text-xs text-muted-foreground">This removes the project and its role assignments.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onDelete(project.id)}
              className="px-3 py-1.5 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: projects, loading } = useProjects(refreshKey)
  const { data: agents } = useAgents()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const newProject = await createProject({ name: name.trim() })
      setName('')
      setShowCreate(false)
      router.push(`/projects/${newProject.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        <header className="flex items-center justify-between section-header-fade pb-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
              <FolderKanban className="w-6 h-6 text-accent" />
              Projects
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Each project has a primary agent that orchestrates work across 7 role lanes.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </header>

        {projects.length === 0 && !loading ? (
          <div className="text-center py-16">
            <FolderKanban className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">
              No projects yet — create one to organize your agent work.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <ProjectCard key={project.id} projectId={project.id} delay={0.1 + i * 0.05} onDelete={handleDelete} agents={agents} />
            ))}
          </div>
        )}
      </div>

      {/* Create Project — minimal modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowCreate(false); setName('') }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-card border border-border rounded-xl p-5 w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-sm font-semibold text-foreground mb-3">New Project</h2>
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreate() }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name, e.g. ScoutAI"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  autoFocus
                  disabled={creating}
                />
                <button
                  type="submit"
                  disabled={!name.trim() || creating}
                  className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </form>
              <p className="text-[10px] text-muted-foreground/50 mt-2">
                A primary agent and advisor role will be set up automatically.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
