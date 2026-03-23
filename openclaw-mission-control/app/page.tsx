import {
  Activity,
  Clock,
  DollarSign,
  Zap,
  AlertTriangle,
  Bot,
  ShieldAlert,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { PageHeader } from '@/components/ui/page-header';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { RunStatusBoard } from '@/components/dashboard/run-status-board';
import { ModelUsageChart } from '@/components/dashboard/model-usage-chart';
import {
  getTodayUsage,
  getActiveRuns,
  getQueuedTasks,
  getStalledRuns,
  getOnlineAgents,
  getNeedsApproval,
} from '@/lib/mock-data';
import { formatNumber, formatCost } from '@/lib/utils';

export default function DashboardPage() {
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
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Active Runs"
          value={activeRuns.length}
          icon={Activity}
          iconColor="text-blue-400"
        />
        <MetricCard
          label="Queued Tasks"
          value={queuedTasks.length}
          icon={Clock}
          iconColor="text-zinc-400"
        />
        <MetricCard
          label="Cost Today"
          value={formatCost(today.cost)}
          subtitle={`${today.runs} runs`}
          icon={DollarSign}
          iconColor="text-emerald-400"
        />
        <MetricCard
          label="Tokens Today"
          value={formatNumber(today.tokens)}
          icon={Zap}
          iconColor="text-yellow-400"
        />
        <MetricCard
          label="Stalled"
          value={stalledRuns.length}
          icon={AlertTriangle}
          iconColor={stalledRuns.length > 0 ? 'text-red-400' : 'text-zinc-500'}
        />
        <MetricCard
          label="Agents Online"
          value={onlineAgents.length}
          icon={Bot}
          iconColor="text-purple-400"
        />
      </div>

      {/* Needs approval banner */}
      {needsApproval.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-[13px] text-amber-200">
            <strong>{needsApproval.length}</strong> task{needsApproval.length > 1 ? 's' : ''} awaiting your approval
          </span>
          <span className="ml-auto text-xs text-amber-400/70 hover:text-amber-300 cursor-pointer transition-colors">
            Review →
          </span>
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
    </div>
  );
}
