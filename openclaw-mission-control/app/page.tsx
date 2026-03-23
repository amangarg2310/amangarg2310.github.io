'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Clock,
  DollarSign,
  Zap,
  AlertTriangle,
  Bot,
  ShieldAlert,
  Plus,
  CheckCircle2,
  XCircle,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { PageHeader } from '@/components/ui/page-header';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { RunStatusBoard } from '@/components/dashboard/run-status-board';
import { ModelUsageChart } from '@/components/dashboard/model-usage-chart';
import { StatusBadge } from '@/components/ui/status-badge';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { ModelBadge } from '@/components/ui/model-badge';
import { Tooltip } from '@/components/ui/tooltip';
import { CreateTaskModal } from '@/components/dashboard/create-task-modal';
import {
  getTodayUsage,
  getActiveRuns,
  getQueuedTasks,
  getStalledRuns,
  getOnlineAgents,
  getNeedsApproval,
  agents,
  tasks,
  runs,
} from '@/lib/mock-data';
import { formatNumber, formatCost, timeAgo, cn } from '@/lib/utils';

export default function DashboardPage() {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showApprovalPanel, setShowApprovalPanel] = useState(false);

  const today = getTodayUsage();
  const activeRuns = getActiveRuns();
  const queuedTasks = getQueuedTasks();
  const stalledRuns = getStalledRuns();
  const onlineAgents = getOnlineAgents();
  const needsApproval = getNeedsApproval();

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Mission Control"
        description="Real-time overview of your AI agent operations"
      >
        <button
          onClick={() => setShowCreateTask(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </PageHeader>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Active Runs"
          value={activeRuns.length}
          icon={Activity}
          iconColor="text-blue-400"
          tooltip="Agent tasks currently executing"
        />
        <MetricCard
          label="Queued Tasks"
          value={queuedTasks.length}
          icon={Clock}
          iconColor="text-zinc-400"
          tooltip="Tasks waiting to be picked up by an agent"
        />
        <MetricCard
          label="Cost Today"
          value={formatCost(today.cost)}
          subtitle={`${today.runs} runs`}
          icon={DollarSign}
          iconColor="text-emerald-400"
          tooltip="Estimated spend from all model API calls today"
        />
        <MetricCard
          label="Tokens Today"
          value={formatNumber(today.tokens)}
          icon={Zap}
          iconColor="text-yellow-400"
          tooltip="Total input + output tokens consumed today"
        />
        <MetricCard
          label="Stalled"
          value={stalledRuns.length}
          icon={AlertTriangle}
          iconColor={stalledRuns.length > 0 ? 'text-red-400' : 'text-zinc-500'}
          tooltip="Runs stuck waiting — may need manual intervention"
        />
        <MetricCard
          label="Agents Online"
          value={onlineAgents.length}
          icon={Bot}
          iconColor="text-purple-400"
          tooltip="Active agents available to accept tasks"
        />
      </div>

      {/* Needs approval banner */}
      {needsApproval.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <button
            onClick={() => setShowApprovalPanel(!showApprovalPanel)}
            className="flex items-center gap-3 px-4 py-3 w-full text-left"
          >
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-[13px] text-amber-200">
              <strong>{needsApproval.length}</strong> task{needsApproval.length > 1 ? 's' : ''} awaiting your approval
            </span>
            <span className="ml-auto text-xs text-amber-400/70 hover:text-amber-300 transition-colors">
              {showApprovalPanel ? 'Hide' : 'Review'} →
            </span>
          </button>
          {showApprovalPanel && (
            <div className="border-t border-amber-500/10 divide-y divide-amber-500/10">
              {needsApproval.map(task => {
                const agent = agents.find(a => a.id === task.assigned_agent_id);
                const run = runs.find(r => r.task_id === task.id && r.status === 'needs_approval');
                return (
                  <div key={task.id} className="px-4 py-3 flex items-center gap-3">
                    {agent && <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">{task.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {agent?.name} completed this task · {run ? formatCost(run.estimated_cost) : '—'}
                        {run && <> · <ModelBadge model={run.actual_model_used} /></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={run ? `/runs/${run.id}` : '/runs'}
                        className="px-2.5 py-1 rounded text-[11px] border border-border hover:bg-white/5 transition-colors text-muted-foreground"
                      >
                        Inspect
                      </Link>
                      <button className="px-2.5 py-1 rounded text-[11px] bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </button>
                      <button className="px-2.5 py-1 rounded text-[11px] bg-red-600/10 border border-red-500/20 text-red-400 hover:bg-red-600/20 transition-colors flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick actions for beginners */}
      {activeRuns.length === 0 && queuedTasks.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-white/[0.01] p-6 text-center space-y-3">
          <div className="text-base font-medium">No active work right now</div>
          <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
            Create a task and assign it to one of your agents, or start a conversation to work with an agent directly.
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              onClick={() => setShowCreateTask(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Create a Task
            </button>
            <Link
              href="/chats"
              className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-[13px] font-medium hover:bg-white/5 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Start a Chat
            </Link>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <RunStatusBoard />
        </div>
        <div className="space-y-4">
          <ModelUsageChart />
        </div>
      </div>

      {/* Activity feed */}
      <ActivityFeed />

      {/* Create task modal */}
      {showCreateTask && <CreateTaskModal onClose={() => setShowCreateTask(false)} />}
    </div>
  );
}
