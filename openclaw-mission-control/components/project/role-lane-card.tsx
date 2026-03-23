'use client'

import { useState } from 'react'
import type { RoleLaneConfig, RoleAssignment, Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { timeAgo } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  UserPlus,
} from 'lucide-react'

interface RoleLaneCardProps {
  role: RoleLaneConfig
  assignment?: RoleAssignment
  agent?: Agent
  taskCount: number
  lastActivity?: string
}

export function RoleLaneCard({ role, assignment, agent, taskCount, lastActivity }: RoleLaneCardProps) {
  const [showJobs, setShowJobs] = useState(false)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden card-glow">
      {/* Color top bar */}
      <div className="h-1" style={{ backgroundColor: role.color }} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{role.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
          </div>
        </div>

        {/* Assigned Agent */}
        {agent && assignment ? (
          <div className="flex items-center gap-2 bg-background/50 border border-border/30 rounded-lg px-3 py-2">
            <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{agent.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{assignment.notes}</div>
            </div>
            <span className={`w-2 h-2 rounded-full shrink-0 ${agent.is_active ? 'bg-status-running led-pulse' : 'bg-muted-foreground/30'}`} />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-background/50 border border-dashed border-border/50 rounded-lg px-3 py-2.5">
            <UserPlus className="w-4 h-4 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/60">Unassigned — assign an agent to this role</span>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
          {lastActivity && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeAgo(lastActivity)}
            </span>
          )}
        </div>

        {/* Suggested Jobs (collapsible) */}
        {role.suggestedJobs.length > 0 && (
          <div>
            <button
              onClick={() => setShowJobs(!showJobs)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showJobs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {role.suggestedJobs.length} suggested automations
            </button>
            {showJobs && (
              <div className="mt-2 space-y-1.5">
                {role.suggestedJobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={job.enabled}
                      disabled
                      className="rounded border-border accent-accent w-3 h-3"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground/70">{job.title}</span>
                      <span className="text-muted-foreground/50 ml-1">· {job.cadence}</span>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground/40 mt-1">
                  Automations are not yet active — coming soon.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
