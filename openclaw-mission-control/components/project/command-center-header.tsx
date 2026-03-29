'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, Check, Bot, X, Target, Crosshair } from 'lucide-react'
import type { Project, ProjectFocus, Agent } from '@/lib/types'
import { updateProjectFocus, updateProjectObjective, updateProjectPrimaryAgent } from '@/lib/api'
import { AgentAvatar } from '@/components/ui/agent-avatar'

interface CommandCenterHeaderProps {
  project: Project
  focus: ProjectFocus | null
  agents: Agent[]
  onChanged: () => void
}

export function CommandCenterHeader({ project, focus, agents, onChanged }: CommandCenterHeaderProps) {
  const [editingFocus, setEditingFocus] = useState(false)
  const [editingObjective, setEditingObjective] = useState(false)
  const [focusText, setFocusText] = useState(focus?.summary || '')
  const [objectiveText, setObjectiveText] = useState(project.objective || '')
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const focusRef = useRef<HTMLTextAreaElement>(null)
  const objectiveRef = useRef<HTMLTextAreaElement>(null)

  const primaryAgent = project.primary_agent_id
    ? agents.find((a) => a.id === project.primary_agent_id)
    : null

  useEffect(() => {
    setFocusText(focus?.summary || '')
  }, [focus?.summary])

  useEffect(() => {
    setObjectiveText(project.objective || '')
  }, [project.objective])

  useEffect(() => {
    if (editingFocus && focusRef.current) {
      focusRef.current.focus()
      focusRef.current.select()
    }
  }, [editingFocus])

  useEffect(() => {
    if (editingObjective && objectiveRef.current) {
      objectiveRef.current.focus()
      objectiveRef.current.select()
    }
  }, [editingObjective])

  const saveFocus = async () => {
    setEditingFocus(false)
    if (focusText !== (focus?.summary || '')) {
      await updateProjectFocus(project.id, focusText)
      onChanged()
    }
  }

  const saveObjective = async () => {
    setEditingObjective(false)
    if (objectiveText !== (project.objective || '')) {
      await updateProjectObjective(project.id, objectiveText)
      onChanged()
    }
  }

  const handleSetPrimaryAgent = async (agentId: string | null) => {
    setShowAgentPicker(false)
    await updateProjectPrimaryAgent(project.id, agentId)
    onChanged()
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

      {/* Primary Agent designation */}
      <div className="mt-4 bg-accent/5 border border-accent/20 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-medium text-accent uppercase tracking-wider">Primary Agent (Orchestrator)</span>
          </div>
          {primaryAgent && (
            <button
              onClick={() => handleSetPrimaryAgent(null)}
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              title="Remove primary agent"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {primaryAgent ? (
          <div className="flex items-center gap-2 mt-2">
            <AgentAvatar name={primaryAgent.name} color={primaryAgent.avatar_color} size="sm" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground">{primaryAgent.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{primaryAgent.specialization}</span>
            </div>
            <span className={`w-2 h-2 rounded-full shrink-0 ${primaryAgent.is_active ? 'bg-status-running led-pulse' : 'bg-muted-foreground/30'}`} />
          </div>
        ) : (
          <div className="relative mt-2">
            <button
              onClick={() => setShowAgentPicker(!showAgentPicker)}
              className="w-full flex items-center gap-2 bg-background/50 border border-dashed border-accent/30 rounded-lg px-3 py-2 hover:border-accent/50 hover:bg-accent/5 transition-all text-left"
            >
              <Bot className="w-4 h-4 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground/60">Assign a primary agent to orchestrate this project</span>
            </button>
            {showAgentPicker && (
              <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {agents.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No agents available</div>
                ) : (
                  agents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleSetPrimaryAgent(a.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
                    >
                      <AgentAvatar name={a.name} color={a.avatar_color} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-foreground font-medium truncate">{a.name}</div>
                        <div className="text-muted-foreground truncate">{a.specialization}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editable objective */}
      <div className="mt-3 bg-background/50 border border-border/30 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Project Objective</span>
          {!editingObjective && (
            <button
              onClick={() => setEditingObjective(true)}
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {editingObjective && (
            <button
              onClick={saveObjective}
              className="p-0.5 rounded hover:bg-white/10 text-accent transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
        </div>
        {editingObjective ? (
          <textarea
            ref={objectiveRef}
            value={objectiveText}
            onChange={(e) => setObjectiveText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveObjective() }
              if (e.key === 'Escape') { setEditingObjective(false); setObjectiveText(project.objective || '') }
            }}
            onBlur={saveObjective}
            rows={2}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none"
            placeholder="What is the outcome this project is driving toward?"
          />
        ) : (
          <p className="text-sm text-foreground/80">
            {project.objective || (
              <span className="text-muted-foreground/40 italic">
                Click to set the project objective...
              </span>
            )}
          </p>
        )}
      </div>

      {/* Editable focus */}
      <div className="mt-3 bg-background/50 border border-border/30 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Crosshair className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Current Focus</span>
          {!editingFocus && (
            <button
              onClick={() => setEditingFocus(true)}
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {editingFocus && (
            <button
              onClick={saveFocus}
              className="p-0.5 rounded hover:bg-white/10 text-accent transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
        </div>
        {editingFocus ? (
          <textarea
            ref={focusRef}
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveFocus() }
              if (e.key === 'Escape') { setEditingFocus(false); setFocusText(focus?.summary || '') }
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
