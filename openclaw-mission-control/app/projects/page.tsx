'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useProjects, useProjectContext } from '@/lib/hooks'
import {
  FolderKanban,
  Activity,
  MessageSquare,
  CheckCircle2,
  Plus,
} from 'lucide-react'

function ProjectCard({ projectId, delay }: { projectId: string; delay: number }) {
  const { data: context } = useProjectContext(projectId)
  if (!context) return null

  const { project, taskCount, activeRunCount, recentConversationCount } = context

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Link
        href={`/projects/${project.id}`}
        className="block bg-card border border-border rounded-xl p-5 card-glow hover:card-hover transition-all group"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: project.color + '20', color: project.color }}
            >
              {project.name[0]}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                {project.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {project.description}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {taskCount} tasks
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" /> {activeRunCount} active
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> {recentConversationCount} chats
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

export default function ProjectsPage() {
  const { data: projects } = useProjects()

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
              Each project has its own agent roles, tasks, and conversations.
            </p>
          </div>
          <button className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </header>

        {projects.length === 0 ? (
          <div className="text-center py-16">
            <FolderKanban className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">
              No projects yet — create one to organize your agent work.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <ProjectCard key={project.id} projectId={project.id} delay={0.1 + i * 0.05} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
