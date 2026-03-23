'use client';

import { dailyUsage, modelUsage, agents, runs } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { ModelBadge } from '@/components/ui/model-badge';
import { formatCost, formatTokens, formatNumber, cn } from '@/lib/utils';
import { getTierLabel, getTierColor } from '@/lib/costs';
import {
  DollarSign,
  Zap,
  TrendingDown,
  Activity,
  BarChart3,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

export default function UsagePage() {
  const totalCost = dailyUsage.reduce((sum, d) => sum + d.estimated_cost, 0);
  const totalTokens = dailyUsage.reduce((sum, d) => sum + d.input_tokens + d.output_tokens, 0);
  const totalRuns = dailyUsage.reduce((sum, d) => sum + d.runs, 0);
  const avgCostPerRun = totalCost / totalRuns;

  // Agent cost breakdown
  const agentCosts = agents
    .map(a => {
      const agentRuns = runs.filter(r => r.agent_id === a.id);
      const totalAgentCost = agentRuns.reduce((sum, r) => sum + r.estimated_cost, 0);
      return { ...a, totalCost: totalAgentCost, runCount: agentRuns.length };
    })
    .sort((a, b) => b.totalCost - a.totalCost);

  // Top spending runs
  const topRuns = [...runs].sort((a, b) => b.estimated_cost - a.estimated_cost).slice(0, 5);

  const chartData = dailyUsage.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: d.estimated_cost,
    tokens: (d.input_tokens + d.output_tokens) / 1000,
    runs: d.runs,
  }));

  const modelChartData = modelUsage.map(m => ({
    model: m.model,
    cost: m.estimated_cost,
    tier: m.tier,
  }));

  const tierColors: Record<string, string> = {
    cheap: '#10b981',
    mid: '#3b82f6',
    premium: '#f59e0b',
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title="Usage & Cost" description="Track token usage, costs, and efficiency across your agent fleet" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Cost (7d)"
          value={formatCost(totalCost)}
          icon={DollarSign}
          iconColor="text-emerald-400"
        />
        <MetricCard
          label="Total Tokens (7d)"
          value={formatNumber(totalTokens)}
          icon={Zap}
          iconColor="text-yellow-400"
        />
        <MetricCard
          label="Total Runs (7d)"
          value={totalRuns}
          icon={Activity}
          iconColor="text-blue-400"
        />
        <MetricCard
          label="Avg Cost / Run"
          value={formatCost(avgCostPerRun)}
          icon={TrendingDown}
          iconColor="text-purple-400"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost over time */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-4">Cost by Day</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cost']}
                />
                <Area type="monotone" dataKey="cost" stroke="#3b82f6" fill="url(#costGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost by model */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-4">Cost by Model</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <YAxis dataKey="model" type="category" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={110} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cost']}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {modelChartData.map((entry, i) => (
                    <Cell key={i} fill={tierColors[entry.tier]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost by agent */}
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium">Cost by Agent</h3>
          </div>
          <div className="divide-y divide-border">
            {agentCosts.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3 px-4 py-3">
                <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{agent.name}</div>
                  <div className="text-[11px] text-muted-foreground">{agent.runCount} runs · avg {formatCost(agent.avg_cost_per_run || 0)}/run</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-semibold">{formatCost(agent.totalCost)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top spending runs */}
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium">Highest-Spend Runs</h3>
          </div>
          <div className="divide-y divide-border">
            {topRuns.map((run) => (
              <div key={run.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{run.task_title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{run.agent_name}</span>
                    <ModelBadge model={run.actual_model_used} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold">{formatCost(run.estimated_cost)}</div>
                  <div className="text-[10px] text-muted-foreground">{formatTokens(run.input_tokens + run.output_tokens)} tok</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Model breakdown table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Model Breakdown</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2.5">Model</th>
              <th className="text-left px-4 py-2.5">Tier</th>
              <th className="text-right px-4 py-2.5">Input Tokens</th>
              <th className="text-right px-4 py-2.5">Output Tokens</th>
              <th className="text-right px-4 py-2.5">Cost</th>
              <th className="text-right px-4 py-2.5">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {modelUsage.map(m => (
              <tr key={m.model} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5"><ModelBadge model={m.model} /></td>
                <td className={cn('px-4 py-2.5 text-[12px] font-medium', getTierColor(m.tier))}>{getTierLabel(m.tier)}</td>
                <td className="px-4 py-2.5 text-right text-[12px] font-mono">{formatTokens(m.input_tokens)}</td>
                <td className="px-4 py-2.5 text-right text-[12px] font-mono">{formatTokens(m.output_tokens)}</td>
                <td className="px-4 py-2.5 text-right text-[13px] font-medium">{formatCost(m.estimated_cost)}</td>
                <td className="px-4 py-2.5 text-right text-[12px] text-muted-foreground">{m.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
