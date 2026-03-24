'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, XCircle, Clock, ShieldAlert } from 'lucide-react'
import type { BlockerItem } from '@/lib/types'
import { timeAgo } from '@/lib/utils'

interface BlockersBannerProps {
  blockers: BlockerItem[]
}

const TYPE_CONFIG = {
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Failed' },
  stalled: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Stalled' },
  needs_approval: { icon: ShieldAlert, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Needs Approval' },
}

export function BlockersBanner({ blockers }: BlockersBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (blockers.length === 0) return null

  const failed = blockers.filter((b) => b.type === 'failed').length
  const stalled = blockers.filter((b) => b.type === 'stalled').length
  const approvals = blockers.filter((b) => b.type === 'needs_approval').length

  return (
    <div className="bg-red-500/5 border border-red-500/15 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-500/5 transition-colors"
      >
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        <div className="flex-1 flex items-center gap-3 text-xs">
          <span className="text-red-400 font-medium">{blockers.length} blocker{blockers.length !== 1 ? 's' : ''}</span>
          <span className="text-muted-foreground">
            {[
              failed > 0 && `${failed} failed`,
              stalled > 0 && `${stalled} stalled`,
              approvals > 0 && `${approvals} awaiting approval`,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {blockers.map((blocker) => {
            const config = TYPE_CONFIG[blocker.type]
            const Icon = config.icon
            return (
              <div
                key={blocker.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${config.bg} border ${config.border}`}
              >
                <Icon className={`w-3.5 h-3.5 ${config.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-foreground/80 truncate block">{blocker.title}</span>
                  <span className="text-[10px] text-muted-foreground">{blocker.agent_name} · {timeAgo(blocker.time)}</span>
                </div>
                <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
