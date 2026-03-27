'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Repeat,
  ArrowUpRight,
} from 'lucide-react'
import { useAgents, useProjects, useRecommendation } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { createTaskDraft } from '@/lib/api'
import { RecommendationPanel } from './recommendation-panel'
import type { Urgency, Tradeoff, ExecutionTier, AutonomyLevel } from '@/lib/execution-policy'
import type { AgentStrategy, RecommendationOverrides } from '@/lib/task-recommender'

const URGENCY_OPTIONS: { id: Urgency; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: 'border-gray-500/30 text-gray-400 hover:border-gray-500/50' },
  { id: 'medium', label: 'Medium', color: 'border-blue-500/30 text-blue-400 hover:border-blue-500/50' },
  { id: 'high', label: 'High', color: 'border-amber-500/30 text-amber-400 hover:border-amber-500/50' },
  { id: 'critical', label: 'Critical', color: 'border-red-500/30 text-red-400 hover:border-red-500/50' },
]

const TRADEOFF_OPTIONS: { id: Tradeoff; label: string; description: string }[] = [
  { id: 'cost', label: 'Cost', description: 'Minimize spend' },
  { id: 'balanced', label: 'Balanced', description: 'Good default' },
  { id: 'quality', label: 'Quality', description: 'Best output' },
]

const CADENCE_OPTIONS = ['daily', 'weekly', 'biweekly', 'monthly'] as const

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const { data: projects } = useProjects()
  const { activeProjectId } = useActiveProject()
  const { data: agents } = useAgents()

  const [projectId, setProjectId] = useState(activeProjectId || '')
  const [goal, setGoal] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('medium')
  const [tradeoff, setTradeoff] = useState<Tradeoff>('balanced')
  const [recurring, setRecurring] = useState(false)
  const [cadence, setCadence] = useState<typeof CADENCE_OPTIONS[number]>('weekly')
  const [tierOverride, setTierOverride] = useState<string | null>(null)
  const [autonomyOverride, setAutonomyOverride] = useState<string | null>(null)
  const [agentStrategyOverride, setAgentStrategyOverride] = useState<AgentStrategy | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSaveDraft = async () => {
    if (!projectId || !goal || saving) return
    setSaving(true)
    try {
      await createTaskDraft({
        goal,
        project_id: projectId,
        priority: urgency,
        role: recommendation?.role ?? null,
        tier: tierOverride ?? recommendation?.tier ?? null,
        autonomy: autonomyOverride ?? recommendation?.autonomy ?? null,
        agent_strategy: agentStrategyOverride ?? recommendation?.agent_strategy ?? null,
        assigned_agent_id: recommendation?.agent_id ?? null,
        workflow_chain_id: recommendation?.workflow_chain?.id ?? null,
      })
      onClose()
    } catch (err) {
      console.error('Failed to save draft:', err)
    } finally {
      setSaving(false)
    }
  }

  const config = useMemo(() => ({
    project_id: projectId,
    goal,
    urgency,
    tradeoff,
    recurring,
    recurrence_cadence: recurring ? cadence : undefined,
  }), [projectId, goal, urgency, tradeoff, recurring, cadence])

  const overrides = useMemo<RecommendationOverrides | undefined>(() => {
    const o: RecommendationOverrides = {}
    if (tierOverride) o.tier = tierOverride as ExecutionTier
    if (autonomyOverride) o.autonomy = autonomyOverride as AutonomyLevel
    if (agentStrategyOverride) o.agent_strategy = agentStrategyOverride
    return Object.keys(o).length > 0 ? o : undefined
  }, [tierOverride, autonomyOverride, agentStrategyOverride])

  const { data: recommendation, loading: recLoading } = useRecommendation(
    projectId || null,
    config,
    overrides,
  )

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
            <h2 className="text-lg font-semibold text-foreground">
              Launch Task
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body — Two panels */}
          <div className="flex-1 overflow-y-auto flex min-h-0">
            {/* Left panel: Configuration */}
            <div className="flex-1 p-6 space-y-6 border-r border-border overflow-y-auto">
              {/* Project */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-[#050506] border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                >
                  <option value="">Select a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Goal */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Goal / Desired Outcome
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={3}
                  placeholder="What do you want to accomplish? Be specific about the deliverable..."
                  className="w-full bg-[#050506] border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none"
                />
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Urgency
                </label>
                <div className="flex gap-2">
                  {URGENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setUrgency(opt.id)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                        urgency === opt.id
                          ? opt.color + ' bg-white/5'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tradeoff */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Optimize For
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {TRADEOFF_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setTradeoff(opt.id)}
                      className={`flex flex-col items-center py-3 px-2 rounded-xl border text-center transition-all ${
                        tradeoff === opt.id
                          ? 'bg-accent/10 border-accent/50'
                          : 'bg-[#050506] border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <span className={`text-sm font-medium ${tradeoff === opt.id ? 'text-accent' : 'text-foreground'}`}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurring */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Recurring Task</span>
                </div>
                <button
                  onClick={() => setRecurring(!recurring)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    recurring ? 'bg-accent' : 'bg-muted-foreground/20'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    recurring ? 'left-5.5' : 'left-0.5'
                  }`} />
                </button>
              </div>

              {recurring && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex gap-2"
                >
                  {CADENCE_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCadence(c)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                        cadence === c
                          ? 'border-accent/50 bg-accent/10 text-accent'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>

            {/* Right panel: Recommendations */}
            <div className="w-80 p-6 bg-background/30 overflow-y-auto">
              <RecommendationPanel
                recommendation={recommendation}
                loading={recLoading}
                onOverrideTier={(t) => setTierOverride(t)}
                onOverrideAutonomy={(a) => setAutonomyOverride(a)}
                onOverrideAgentStrategy={(s) => setAgentStrategyOverride(s)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-card/50 flex items-center justify-between">
            <div className="text-xs text-muted-foreground space-y-0.5">
              {recommendation && (
                <>
                  <div>
                    {recommendation.role_label} · {tierOverride || recommendation.tier_label} · Est. {recommendation.estimated_cost}
                  </div>
                  {(tierOverride || autonomyOverride || agentStrategyOverride) && (
                    <div className="text-accent text-[10px]">
                      Manual overrides applied
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <div className="relative group">
                <button
                  disabled={!projectId || !goal || saving}
                  onClick={handleSaveDraft}
                  className="px-6 py-2 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <div className="absolute bottom-full right-0 mb-2 w-56 bg-card border border-border rounded-lg shadow-lg px-3 py-2 hidden group-hover:block">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Saves task and queues it for agent execution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
