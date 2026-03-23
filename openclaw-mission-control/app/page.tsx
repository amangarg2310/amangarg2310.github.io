'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  DollarSign,
  Plus,
} from 'lucide-react'
import { MetricCard } from '@/components/ui/metric-card'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { RunStatusBoard } from '@/components/dashboard/run-status-board'
import { ModelUsageChart } from '@/components/dashboard/model-usage-chart'
import { TeamView } from '@/components/dashboard/team-view'
import { GettingStarted } from '@/components/dashboard/getting-started'
import { CreateTaskModal } from '@/components/dashboard/create-task-modal'
import { useDashboardStats, useRuns } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { formatCost } from '@/lib/utils'

export default function DashboardPage() {
  const [showCreateTask, setShowCreateTask] = useState(false)
  const { activeProjectId } = useActiveProject()

  const { activeRuns, needsApproval, failedRuns, todayUsage: today } = useDashboardStats(activeProjectId)
  const { data: runs } = useRuns(activeProjectId)

  const totalCostToday = today.cost
  const totalTokensToday = today.tokens
  const idleRuns = runs.filter((r) => r.status === 'idle')

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
          <button
            onClick={() => setShowCreateTask(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-accent"
          >
            <Plus className="w-4 h-4" />
            Create Task
          </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Active Runs"
            value={String(activeRuns.length)}
            icon={<Activity className="w-5 h-5" />}
            accentColor="#3b82f6"
            sparkData={[activeRuns.length]}
            delay={0.1}
          />
          <MetricCard
            title="Idle Sessions"
            value={String(idleRuns.length)}
            icon={<Activity className="w-5 h-5" />}
            accentColor="#71717a"
            sparkData={[idleRuns.length]}
            delay={0.15}
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
            title="Cost Today"
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

      {/* Create task modal */}
      <CreateTaskModal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
      />
    </div>
  )
}
