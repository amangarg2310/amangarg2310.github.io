'use client'

import { useState } from 'react'
import type { RoleLaneConfig, RoleAssignment, Agent, AutomationConfig } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { timeAgo } from '@/lib/utils'
import { assignRole, unassignRole, toggleAutomation } from '@/lib/api'
import { ROLE_TIER_DEFAULTS, TIER_LABELS } from '@/lib/execution-policy'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  UserPlus,
  X,
  Zap,
} from 'lucide-react'

interface RoleLaneCardProps {
  role: RoleLaneConfig
  assignment?: RoleAssignment
  agent?: Agent
  allAgents: Agent[]
  projectId: string
  taskCount: number
  activeRunCount?: number
  lastActivity?: string
  automationConfigs?: AutomationConfig[]
  onAssignmentChange: () => void
}

export function RoleLaneCard({
  role,
  assignment,
  agent,
  allAgents,
  projectId,
  taskCount,
  activeRunCount = 0,
  lastActivity,
  automationConfigs = [],
  onAssignmentChange,
}: RoleLaneCardProps) {
  const [showJobs, setShowJobs] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  const defaultTier = ROLE_TIER_DEFAULTS[role.id]
  const tierLabel = TIER_LABELS[defaultTier]
  const enabledCount = automationConfigs.filter((ac) => ac.enabled).length

  const handleAssign = async (agentId: string) => {
    setSaving(true)
    try {
      await assignRole(projectId, { role: role.id, agent_id: agentId })
      setShowAgentPicker(false)
      onAssignmentChange()
    } catch (err) {
      console.error('Failed to assign role:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleUnassign = async () => {
    setSaving(true)
    try {
      await unassignRole(projectId, role.id)
      onAssignmentChange()
    } catch (err) {
      console.error('Failed to unassign role:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleJob = async (jobId: string, enabled: boolean) => {
    try {
      await toggleAutomation(projectId, jobId, role.id, enabled)
      onAssignmentChange()
    } catch (err) {
      console.error('Failed to toggle automation:', err)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden card-glow">
      <div className="h-1" style={{ backgroundColor: role.color }} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{role.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
          </div>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-background/50 border border-border/30 text-muted-foreground shrink-0">
            {tierLabel}
          </span>
        </div>

        {/* Assigned Agent */}
        {agent && assignment ? (
          <div className="flex items-center gap-2 bg-background/50 border border-border/30 rounded-lg px-3 py-2">
            <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{agent.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{assignment.notes || agent.specialization}</div>
            </div>
            <span className={`w-2 h-2 rounded-full shrink-0 ${agent.is_active ? 'bg-status-running led-pulse' : 'bg-muted-foreground/30'}`} />
            <button
              onClick={handleUnassign}
              disabled={saving}
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Unassign agent"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowAgentPicker(!showAgentPicker)}
              className="w-full flex items-center gap-2 bg-background/50 border border-dashed border-border/50 rounded-lg px-3 py-2.5 hover:border-accent/30 hover:bg-accent/5 transition-all"
            >
              <UserPlus className="w-4 h-4 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground/60">Assign an agent to this role</span>
            </button>

            {showAgentPicker && (
              <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {allAgents.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No agents available</div>
                ) : (
                  allAgents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleAssign(a.id)}
                      disabled={saving}
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

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
          {activeRunCount > 0 && (
            <span className="text-blue-400">{activeRunCount} running</span>
          )}
          {lastActivity && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeAgo(lastActivity)}
            </span>
          )}
          {enabledCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <Zap className="w-3 h-3" /> {enabledCount} auto
            </span>
          )}
        </div>

        {/* Automations */}
        {role.suggestedJobs.length > 0 && (
          <div>
            <button
              onClick={() => setShowJobs(!showJobs)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showJobs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {role.suggestedJobs.length} automations · {enabledCount} enabled
            </button>
            {showJobs && (
              <div className="mt-2 space-y-1.5">
                {role.suggestedJobs.map((job) => {
                  const config = automationConfigs.find((ac) => ac.job_id === job.id)
                  const isEnabled = config?.enabled ?? false
                  return (
                    <div key={job.id} className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => handleToggleJob(job.id, !isEnabled)}
                        disabled={!agent}
                        className={`relative w-7 h-4 rounded-full transition-colors ${
                          isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                        } ${!agent ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                          isEnabled ? 'left-3.5' : 'left-0.5'
                        }`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={isEnabled ? 'text-foreground' : 'text-foreground/50'}>{job.title}</span>
                        <span className="text-muted-foreground/50 ml-1">· {job.cadence}</span>
                      </div>
                    </div>
                  )
                })}
                {!agent && (
                  <p className="text-[10px] text-muted-foreground/40 mt-1">
                    Assign an agent to enable automations.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
