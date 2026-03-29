'use client'

import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  DollarSign,
  MessageSquare,
  Inbox,
} from 'lucide-react'
import { MetricCard } from '@/components/ui/metric-card'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { RunStatusBoard } from '@/components/dashboard/run-status-board'
import { ModelUsageChart } from '@/components/dashboard/model-usage-chart'
import { TeamView } from '@/components/dashboard/team-view'
import { GettingStarted } from '@/components/dashboard/getting-started'
import { AgentTasks } from '@/components/dashboard/agent-tasks'
import { useDashboardStats, useRuns, useConversations, useTasks } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { formatCost } from '@/lib/utils'

export default function DashboardPage() {
  const { activeProjectId } = useActiveProject()

  const { activeRuns, needsApproval, failedRuns, queuedTasks, todayUsage: today } = useDashboardStats(activeProjectId)
  const { data: runs } = useRuns(activeProjectId)
  const { data: conversations } = useConversations(activeProjectId)

  const totalCostToday = today.cost
  const totalTokensToday = today.tokens
  const idleRuns = runs.filter((r) => r.status === 'idle')
  const activeConversations = conversations.filter((c) => c.status === 'active')

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Top Bar */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Mission Control
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </header>

        {/* Approval Banner */}
        {needsApproval.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-status-approval/10 border border-status-approval/20 border-l-4 border-l-status-approval rounded-lg p-4 flex items-center justify-between card-glow"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-status-approval" />
              <span className="text-sm font-medium text-foreground">
                {needsApproval.length} task
                {needsApproval.length > 1 ? 's' : ''} awaiting your
                approval
              </span>
            </div>
            <button className="text-sm font-medium text-status-approval hover:text-status-approval/80 transition-colors">
              Review Tasks &rarr;
            </button>
          </motion.div>
        )}

        {/* Metric Cards Row — all live data, no fake deltas */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Active Runs"
            value={String(activeRuns.length)}
            icon={<Activity className="w-5 h-5" />}
            accentColor="#3b82f6"
            sparkData={[activeRuns.length]}
            delay={0.1}
          />
          <MetricCard
            title="Conversations"
            value={String(activeConversations.length)}
            icon={<MessageSquare className="w-5 h-5" />}
            accentColor="#10b981"
            sparkData={[activeConversations.length]}
            delay={0.13}
          />
          <MetricCard
            title="Backlog"
            value={String(queuedTasks.length)}
            icon={<Inbox className="w-5 h-5" />}
            accentColor="#f59e0b"
            sparkData={[queuedTasks.length]}
            delay={0.16}
          />
          <MetricCard
            title="Failed"
            value={String(failedRuns.length)}
            icon={<AlertTriangle className="w-5 h-5" />}
            accentColor="#ef4444"
            sparkData={[failedRuns.length]}
            delay={0.2}
          />
          <MetricCard
            title="Est. Cost Today"
            value={totalCostToday > 0 ? formatCost(totalCostToday) : '$0.00'}
            icon={<DollarSign className="w-5 h-5" />}
            accentColor="#a855f7"
            sparkData={[totalCostToday]}
            delay={0.25}
          />
        </div>

        {/* Getting Started Checklist */}
        <GettingStarted />

        {/* Active Agent Teams - Pipeline View */}
        <TeamView />

        {/* Agent-Created Tasks / Backlog Items */}
        <AgentTasks />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <RunStatusBoard />
          </div>
          <div className="lg:col-span-2">
            <ModelUsageChart />
          </div>
        </div>

        {/* Activity Feed */}
        <ActivityFeed />
      </div>

    </div>
  )
}
