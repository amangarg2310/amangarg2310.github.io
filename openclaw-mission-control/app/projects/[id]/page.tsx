'use client'

import { use } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useProjectContext, useAgents, useTasks, useRuns } from '@/lib/hooks'
import { ROLE_LANES } from '@/lib/roles'
import { RoleLaneCard } from '@/components/project/role-lane-card'
import {
  FolderKanban,
  ArrowLeft,
  Activity,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react'

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: context } = useProjectContext(id)
  const { data: agents } = useAgents()
  const { data: tasks } = useTasks(id)
  const { data: runs } = useRuns(id)

  if (!context) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen">
        <p className="text-sm text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  const { project, assignments } = context

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="section-header-fade pb-2">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Projects
          </Link>
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: project.color + '20', color: project.color }}
            >
              {project.name[0]}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
                {project.name}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
            </div>
          </div>

          {/* Summary stats */}
          <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {tasks.length} tasks
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> {runs.filter((r) => r.status === 'running').length} active runs
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> {context.recentConversationCount} conversations
            </span>
            <span className="flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5" /> {assignments.length} roles assigned
            </span>
          </div>
        </header>

        {/* Role Lanes Grid */}
        <section>
          <h2 className="text-sm font-medium text-foreground mb-4">Role Lanes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ROLE_LANES.map((role, i) => {
              const assignment = assignments.find((a) => a.role === role.id)
              const agent = assignment ? agents.find((a) => a.id === assignment.agent_id) : undefined
              const roleTasks = tasks.filter((t) => t.assigned_agent_id === assignment?.agent_id)
              const lastRun = runs
                .filter((r) => r.agent_id === assignment?.agent_id)
                .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]

              return (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                >
                  <RoleLaneCard
                    role={role}
                    assignment={assignment}
                    agent={agent}
                    taskCount={roleTasks.length}
                    lastActivity={lastRun?.started_at}
                  />
                </motion.div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
