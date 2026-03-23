'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  Zap,
  Plus,
} from 'lucide-react'
import { MetricCard } from '@/components/ui/metric-card'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { RunStatusBoard } from '@/components/dashboard/run-status-board'
import { ModelUsageChart } from '@/components/dashboard/model-usage-chart'
import { TeamView } from '@/components/dashboard/team-view'
import { GettingStarted } from '@/components/dashboard/getting-started'
import { CreateTaskModal } from '@/components/dashboard/create-task-modal'
import { useDashboardStats } from '@/lib/hooks'

export default function DashboardPage() {
  const [showCreateTask, setShowCreateTask] = useState(false)

  const { activeRuns, needsApproval, todayUsage: today } = useDashboardStats()

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

        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricCard
            title="Active Runs"
            value={String(activeRuns.length)}
            change="+2"
            changeType="up"
            icon={<Activity className="w-5 h-5" />}
            accentColor="#3b82f6"
            sparkData={[2, 4, 3, 5, 8, 10, activeRuns.length]}
            delay={0.1}
          />
          <MetricCard
            title="Tasks Completed"
            value="847"
            change="+12%"
            changeType="up"
            icon={<CheckCircle2 className="w-5 h-5" />}
            accentColor="#10b981"
            sparkData={[40, 50, 45, 60, 70, 85, 90]}
            delay={0.15}
          />
          <MetricCard
            title="Pending Approval"
            value={String(needsApproval.length)}
            change="-1"
            changeType="down"
            icon={<Clock className="w-5 h-5" />}
            accentColor="#f59e0b"
            sparkData={[5, 4, 4, 6, 5, 4, needsApproval.length]}
            delay={0.2}
          />
          <MetricCard
            title="Failed"
            value="2"
            change="0"
            changeType="neutral"
            icon={<AlertTriangle className="w-5 h-5" />}
            accentColor="#ef4444"
            sparkData={[1, 0, 2, 1, 3, 2, 2]}
            delay={0.25}
          />
          <MetricCard
            title="Cost Today"
            value={`$${today.cost.toFixed(2)}`}
            change="+$5.20"
            changeType="up"
            icon={<DollarSign className="w-5 h-5" />}
            accentColor="#a855f7"
            sparkData={[10, 15, 12, 20, 25, 30, today.cost]}
            delay={0.3}
          />
          <MetricCard
            title="Avg Latency"
            value="1.2s"
            change="-0.3s"
            changeType="down"
            icon={<Zap className="w-5 h-5" />}
            accentColor="#06b6d4"
            sparkData={[1.8, 1.7, 1.5, 1.6, 1.4, 1.3, 1.2]}
            delay={0.35}
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
