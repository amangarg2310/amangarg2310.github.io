'use client'

import Link from 'next/link'
import { useProjects } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { MessageSquare, FolderKanban } from 'lucide-react'

/**
 * Chat Workspace redirect page.
 * Chat now lives inside each project workspace.
 * This page redirects to the active project or shows project selection.
 */
export default function ChatsPage() {
  const { activeProjectId } = useActiveProject()
  const { data: projects } = useProjects()
  const router = useRouter()

  // Auto-redirect if a project is selected
  useEffect(() => {
    if (activeProjectId) {
      router.replace(`/projects/${activeProjectId}?tab=chat`)
    }
  }, [activeProjectId, router])

  if (activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-background">
        <p className="text-sm text-muted-foreground">Redirecting to project chat...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center h-screen bg-background">
      <div className="max-w-md text-center space-y-6">
        <MessageSquare className="w-12 h-12 text-accent mx-auto opacity-60" />
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Chat lives inside projects</h2>
          <p className="text-sm text-muted-foreground">
            Select a project to start chatting with your AI agent. Each project has its own chat workspace.
          </p>
        </div>
        <div className="space-y-2">
          {projects.length === 0 ? (
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <FolderKanban className="w-4 h-4" /> Create your first project
            </Link>
          ) : (
            projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}?tab=chat`}
                className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg hover:border-accent/30 hover:bg-accent/5 transition-all w-full"
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-sm font-medium text-foreground">{p.name}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
