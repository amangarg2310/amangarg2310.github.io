'use client'

import { use, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useCommandCenter, useAgents, useAutomations } from '@/lib/hooks'
import type { RoleLane } from '@/lib/types'
import { ROLE_LANES } from '@/lib/roles'
import { RoleLaneCard } from '@/components/project/role-lane-card'
import { CommandCenterHeader } from '@/components/project/command-center-header'
import { BlockersBanner } from '@/components/project/blockers-banner'
import { NextActionsPanel } from '@/components/project/next-actions-panel'
import { BudgetSummary } from '@/components/project/budget-summary'
import { WorkflowStatus } from '@/components/project/workflow-status'
import { CreateTaskModal } from '@/components/dashboard/create-task-modal'
import { timeAgo } from '@/lib/utils'
import {
  Activity,
  Zap,
  PlayCircle,
  PauseCircle,
} from 'lucide-react'

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: cc, loading } = useCommandCenter(id)
  const { data: agents } = useAgents()
  const { data: automationConfigs } = useAutomations(id)
  const router = useRouter()
  const [refreshKey, setRefreshKey] = useState(0)
  const [showTaskModal, setShowTaskModal] = useState(false)

  const handleChange = useCallback(() => {
    setRefreshKey((k) => k + 1)
    window.location.reload()
  }, [])

  if (loading || !cc) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen">
        <p className="text-sm text-muted-foreground">Loading command center...</p>
      </div>
    )
  }

  const { project, focus, roleSummaries, blockers, nextActions, budgetSummary, recentActivity, automationSummary, activeWorkflows } = cc

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
        {/* Header with editable focus */}
        <CommandCenterHeader
          project={project}
          focus={focus}
          onFocusUpdated={handleChange}
        />

        {/* Blockers banner */}
        <BlockersBanner blockers={blockers} />

        {/* Metric cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <MetricCard
            icon={<PlayCircle className="w-4 h-4 text-blue-400" />}
            label="Active Runs"
            value={roleSummaries.reduce((s, r) => s + r.activeRunCount, 0)}
          />
          <MetricCard
            icon={<PauseCircle className="w-4 h-4 text-muted-foreground" />}
            label="Idle Agents"
            value={roleSummaries.filter((r) => r.agent_id && r.activeRunCount === 0).length}
          />
          <MetricCard
            icon={<Zap className="w-4 h-4 text-emerald-400" />}
            label="Automations"
            value={`${automationSummary.enabled} / ${automationSummary.total}`}
          />
          <MetricCard
            icon={<Activity className="w-4 h-4 text-amber-400" />}
            label="Roles Assigned"
            value={`${roleSummaries.filter((r) => r.agent_id).length} / 7`}
          />
        </motion.div>

        {/* Active workflows */}
        <WorkflowStatus workflows={activeWorkflows} />

        {/* Role Lanes Grid */}
        <section>
          <h2 className="text-sm font-medium text-foreground mb-4">Role Lanes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ROLE_LANES.map((role, i) => {
              const summary = roleSummaries.find((s) => s.role === role.id)
              const assignment = summary?.agent_id ? {
                id: `ra-${role.id}`,
                project_id: id,
                role: role.id as RoleLane,
                agent_id: summary.agent_id,
                notes: '',
                created_at: '',
              } : undefined
              const agent = summary?.agent_id ? agents.find((a) => a.id === summary.agent_id) : undefined
              const roleAutomations = automationConfigs.filter((ac) => ac.role === role.id)

              return (
                <motion.div
                  key={`${role.id}-${refreshKey}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.03 }}
                >
                  <RoleLaneCard
                    role={role}
                    assignment={assignment}
                    agent={agent}
                    allAgents={agents}
                    projectId={id}
                    taskCount={summary?.taskCount ?? 0}
                    activeRunCount={summary?.activeRunCount ?? 0}
                    lastActivity={summary?.lastActivity ?? undefined}
                    automationConfigs={roleAutomations}
                    onAssignmentChange={handleChange}
                    onCreateTask={() => setShowTaskModal(true)}
                    onViewOutput={(agentId) => router.push(`/chats?agent=${agentId}`)}
                  />
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* Bottom section: Activity + Next Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Recent Activity
            </h3>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-4">
                No recent activity for this project.
              </p>
            ) : (
              <div className="space-y-2">
                {recentActivity.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-start gap-2.5 py-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      item.type === 'completed' ? 'bg-emerald-400' :
                      item.type === 'failed' ? 'bg-red-400' :
                      item.type === 'needs_approval' ? 'bg-amber-400' :
                      item.type === 'stalled' ? 'bg-orange-400' :
                      'bg-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground/80 truncate">{item.text}</p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(item.time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Next Actions */}
          <div className="lg:col-span-1">
            <NextActionsPanel actions={nextActions} />
          </div>
        </div>

        {/* Budget */}
        <BudgetSummary budget={budgetSummary} />
      </div>

      <CreateTaskModal isOpen={showTaskModal} onClose={() => setShowTaskModal(false)} />
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 card-glow">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xl font-semibold text-foreground font-mono">{value}</span>
    </div>
  )
}
