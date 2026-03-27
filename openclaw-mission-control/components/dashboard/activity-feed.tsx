'use client'

import { useActivity } from '@/lib/hooks'
import { timeAgo } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
  Zap,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react'

const typeConfig: Record<
  string,
  { icon: React.ElementType; colorClass: string }
> = {
  started: {
    icon: Zap,
    colorClass:
      'bg-status-model/10 border-status-model/20 text-status-model',
  },
  completed: {
    icon: CheckCircle2,
    colorClass:
      'bg-status-success/10 border-status-success/20 text-status-success',
  },
  failed: {
    icon: AlertTriangle,
    colorClass:
      'bg-status-failed/10 border-status-failed/20 text-status-failed',
  },
  needs_approval: {
    icon: Clock,
    colorClass:
      'bg-status-approval/10 border-status-approval/20 text-status-approval',
  },
  stalled: {
    icon: AlertTriangle,
    colorClass:
      'bg-status-failed/10 border-status-failed/20 text-status-failed',
  },
}

export function ActivityFeed() {
  const { data: activity } = useActivity()

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      className="space-y-4 pb-12"
    >
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider section-header-fade">
        Activity Feed
      </h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden card-glow">
        {activity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Clock className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground/50">Activity appears here as agents run tasks.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {activity.map((item) => {
              const config = typeConfig[item.type] || typeConfig.started
              const Icon = config.icon
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border ${config.colorClass}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm text-foreground font-medium">
                      {item.text}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {timeAgo(item.time)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.section>
  )
}
