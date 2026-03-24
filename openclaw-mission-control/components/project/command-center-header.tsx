'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, Check } from 'lucide-react'
import type { Project, ProjectFocus } from '@/lib/types'
import { updateProjectFocus } from '@/lib/api'

interface CommandCenterHeaderProps {
  project: Project
  focus: ProjectFocus | null
  onFocusUpdated: () => void
}

export function CommandCenterHeader({ project, focus, onFocusUpdated }: CommandCenterHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [focusText, setFocusText] = useState(focus?.summary || '')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setFocusText(focus?.summary || '')
  }, [focus?.summary])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const saveFocus = async () => {
    setEditing(false)
    if (focusText !== (focus?.summary || '')) {
      await updateProjectFocus(project.id, focusText)
      onFocusUpdated()
    }
  }

  return (
    <header className="section-header-fade pb-2">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-3 h-3" /> Back to Projects
      </Link>

      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ backgroundColor: project.color + '20', color: project.color }}
        >
          {project.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {project.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
        </div>
      </div>

      {/* Editable focus */}
      <div className="mt-4 bg-background/50 border border-border/30 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Current Focus</span>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {editing && (
            <button
              onClick={saveFocus}
              className="p-0.5 rounded hover:bg-white/10 text-accent transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
        </div>
        {editing ? (
          <textarea
            ref={inputRef}
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveFocus() }
              if (e.key === 'Escape') { setEditing(false); setFocusText(focus?.summary || '') }
            }}
            onBlur={saveFocus}
            rows={2}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none"
            placeholder="What are you focused on right now?"
          />
        ) : (
          <p className="text-sm text-foreground/80">
            {focus?.summary || (
              <span className="text-muted-foreground/40 italic">
                Click to set your current focus...
              </span>
            )}
          </p>
        )}
      </div>
    </header>
  )
}
