'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAgents, useTasks, useRuns } from '@/lib/hooks'
import type { Agent, Task, Run } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { cn } from '@/lib/utils'
import {
  Search,
  LayoutDashboard,
  Activity,
  MessageSquare,
  Bot,
  BarChart3,
  Settings,
  ShieldCheck,
  LayoutGrid,
  Plus,
  ArrowRight,
  Command,
} from 'lucide-react'

interface SearchResult {
  id: string
  type: 'page' | 'agent' | 'task' | 'run' | 'action'
  title: string
  subtitle: string
  href: string
  icon?: React.ElementType
  agentColor?: string
}

const pages: SearchResult[] = [
  { id: 'p-dashboard', type: 'page', title: 'Mission Control', subtitle: 'Dashboard overview', href: '/', icon: LayoutDashboard },
  { id: 'p-runs', type: 'page', title: 'Run Inspector', subtitle: 'Monitor agent runs', href: '/runs', icon: Activity },
  { id: 'p-chats', type: 'page', title: 'Chat Workspace', subtitle: 'Conversations with agents', href: '/chats', icon: MessageSquare },
  { id: 'p-agents', type: 'page', title: 'Agent Registry', subtitle: 'Manage agents', href: '/agents', icon: Bot },
  { id: 'p-boards', type: 'page', title: 'Boards', subtitle: 'Kanban task management', href: '/boards', icon: LayoutGrid },
  { id: 'p-approvals', type: 'page', title: 'Approvals', subtitle: 'Review pending decisions', href: '/approvals', icon: ShieldCheck },
  { id: 'p-activity', type: 'page', title: 'Activity Log', subtitle: 'Full audit trail', href: '/activity', icon: Activity },
  { id: 'p-usage', type: 'page', title: 'Usage & Cost', subtitle: 'Spending analytics', href: '/usage', icon: BarChart3 },
  { id: 'p-settings', type: 'page', title: 'Settings', subtitle: 'Configuration', href: '/settings', icon: Settings },
]

const actions: SearchResult[] = [
  { id: 'a-newtask', type: 'action', title: 'Create New Task', subtitle: 'Deploy a task to an agent', href: '/?newTask=true', icon: Plus },
]

function getSearchResults(query: string, agents: Agent[], tasks: Task[], runs: Run[]): SearchResult[] {
  if (!query.trim()) {
    return [...actions, ...pages.slice(0, 5)]
  }

  const q = query.toLowerCase()
  const results: SearchResult[] = []

  // Pages
  for (const page of pages) {
    if (page.title.toLowerCase().includes(q) || page.subtitle.toLowerCase().includes(q)) {
      results.push(page)
    }
  }

  // Actions
  for (const action of actions) {
    if (action.title.toLowerCase().includes(q)) {
      results.push(action)
    }
  }

  // Agents
  for (const agent of agents) {
    if (agent.name.toLowerCase().includes(q) || agent.specialization.toLowerCase().includes(q)) {
      results.push({
        id: `agent-${agent.id}`,
        type: 'agent',
        title: agent.name,
        subtitle: `${agent.specialization} · ${agent.default_model}`,
        href: '/agents',
        agentColor: agent.avatar_color,
      })
    }
  }

  // Tasks
  for (const task of tasks) {
    if (task.title.toLowerCase().includes(q)) {
      results.push({
        id: `task-${task.id}`,
        type: 'task',
        title: task.title,
        subtitle: `${task.status} · ${task.priority} priority`,
        href: '/boards',
      })
    }
  }

  // Runs
  for (const run of runs.slice(0, 20)) {
    if (
      run.task_title?.toLowerCase().includes(q) ||
      run.agent_name?.toLowerCase().includes(q) ||
      run.id.toLowerCase().includes(q)
    ) {
      results.push({
        id: `run-${run.id}`,
        type: 'run',
        title: run.task_title || run.id,
        subtitle: `${run.agent_name} · ${run.status} · ${run.actual_model_used}`,
        href: `/runs/${run.id}`,
      })
    }
  }

  return results.slice(0, 12)
}

export function CommandPalette() {
  const { data: agents } = useAgents()
  const { data: tasks } = useTasks()
  const { data: runs } = useRuns()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const results = getSearchResults(query, agents, tasks, runs)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
        setQuery('')
        setSelectedIndex(0)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    },
    []
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    router.push(result.href)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex])
    }
  }

  const typeIcons: Record<string, React.ElementType> = {
    page: LayoutDashboard,
    agent: Bot,
    task: LayoutGrid,
    run: Activity,
    action: Plus,
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search pages, agents, tasks, runs..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <kbd className="text-[10px] text-muted-foreground bg-white/5 border border-border px-1.5 py-0.5 rounded font-mono">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[360px] overflow-y-auto py-2">
              {results.length > 0 ? (
                results.map((result, i) => {
                  const Icon = result.icon || typeIcons[result.type] || ArrowRight
                  const isSelected = i === selectedIndex

                  return (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-accent/10' : 'hover:bg-white/[0.03]'
                      )}
                    >
                      {result.agentColor ? (
                        <AgentAvatar
                          name={result.title}
                          color={result.agentColor}
                          size="sm"
                        />
                      ) : (
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center border',
                            isSelected
                              ? 'bg-accent/10 border-accent/20 text-accent'
                              : 'bg-white/5 border-border text-muted-foreground'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            'text-sm font-medium truncate',
                            isSelected ? 'text-accent' : 'text-foreground'
                          )}
                        >
                          {result.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {result.subtitle}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 capitalize">
                        {result.type}
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No results for &quot;{query}&quot;
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="bg-white/5 border border-border px-1 py-0.5 rounded font-mono">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-white/5 border border-border px-1 py-0.5 rounded font-mono">↵</kbd> select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-white/5 border border-border px-1 py-0.5 rounded font-mono">esc</kbd> close
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
