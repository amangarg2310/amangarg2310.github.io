'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAgents, useRuns, useProjects } from '@/lib/hooks'
import { X, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function GettingStarted() {
  const [dismissed, setDismissed] = useState(false)
  const { data: agents } = useAgents()
  const { data: runs } = useRuns()
  const { data: projects } = useProjects()

  const steps = [
    {
      label: 'SDK Connected',
      done: true,
      hint: 'Claude Code SDK is active — uses your existing login, no API key needed',
      link: null,
    },
    {
      label: 'Project Created',
      done: projects.length > 0,
      hint: 'Create a project to organize agents and work',
      link: '/projects',
    },
    {
      label: 'Agent Assigned',
      done: agents.length > 0,
      hint: 'Assign agents to role lanes in your project command center',
      link: projects.length > 0 ? `/projects/${projects[0].id}` : '/projects',
    },
    {
      label: 'First Conversation',
      done: runs.length > 0,
      hint: 'Open a project → Chat tab to start a conversation',
      link: projects.length > 0 ? `/projects/${projects[0].id}` : '/projects',
    },
    {
      label: 'Task Completed',
      done: runs.some((r) => r.status === 'completed'),
      hint: 'Agents create tasks in Backlog; track them in the Boards tab',
      link: projects.length > 0 ? `/projects/${projects[0].id}?tab=boards` : '/projects',
    },
  ]
  const completedCount = steps.filter((s) => s.done).length
  const allDone = completedCount === steps.length

  // Hide if dismissed or all steps complete
  if (dismissed || allDone) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0, marginTop: 0 }}
        className="bg-card border border-border rounded-xl overflow-hidden card-glow"
      >
        <div className="p-4 border-b border-border/50 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold text-sm">
              {completedCount}/{steps.length}
            </div>
            <h2 className="text-sm font-medium text-foreground">
              Getting Started
            </h2>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-4 bg-card">
          {steps.map((item, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                    item.done
                      ? 'bg-status-success border-status-success'
                      : 'border-muted-foreground/50'
                  }`}
                >
                  {item.done && (
                    <Check className="w-3 h-3 text-background" />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    item.done
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {item.label}
                </span>
              </div>
              {!item.done && (
                item.link ? (
                  <Link href={item.link} className="text-[10px] text-blue-400/70 hover:text-blue-400 ml-6 transition-colors">
                    {item.hint} &rarr;
                  </Link>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50 ml-6">
                    {item.hint}
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
