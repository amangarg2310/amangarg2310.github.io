'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRuns, useAgents } from '@/lib/hooks';
import { StatusBadge } from '@/components/ui/status-badge';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { ModelBadge } from '@/components/ui/model-badge';
import { PageHeader } from '@/components/ui/page-header';
import { Tooltip } from '@/components/ui/tooltip';
import { formatCost, formatTokens, formatDuration, cn } from '@/lib/utils';
import { RunStatus } from '@/lib/types';
import {
  Search,
  RotateCcw,
  Pause,
  XCircle,
  ArrowUpRight,
  Play,
  Bot,
  ArrowRightLeft,
} from 'lucide-react';

const statusFilters: { label: string; value: RunStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Queued', value: 'queued' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Stalled', value: 'stalled' },
  { label: 'Needs Approval', value: 'needs_approval' },
];

export default function RunsPage() {
  const { data: runs } = useRuns();
  const { data: agents } = useAgents();
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');

  const filteredRuns = statusFilter === 'all'
    ? runs
    : runs.filter(r => r.status === statusFilter);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title="Runs" description="Monitor and manage agent execution runs">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search runs..."
            className="h-8 w-48 rounded-md border border-border bg-card pl-8 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-blue-500/50"
          />
        </div>
      </PageHeader>

      {/* Status filters */}
      <div className="flex items-center gap-1 overflow-auto">
        {statusFilters.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap',
              statusFilter === f.value
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            {f.label}
            {f.value !== 'all' && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                {runs.filter(r => r.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredRuns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white/[0.01] py-12 text-center space-y-3">
          <Play className="h-10 w-10 text-muted-foreground mx-auto opacity-30" />
          {statusFilter !== 'all' ? (
            <>
              <p className="text-[13px] text-muted-foreground">No runs with status &quot;{statusFilter.replace('_', ' ')}&quot;</p>
              <button onClick={() => setStatusFilter('all')} className="text-[12px] text-blue-400">Show all runs</button>
            </>
          ) : (
            <>
              <p className="text-base font-medium">No runs yet</p>
              <p className="text-[13px] text-muted-foreground max-w-sm mx-auto">
                Runs are created when you assign a task to an agent. Go to Mission Control to create your first task.
              </p>
              <Link href="/" className="text-[12px] text-blue-400 inline-block">Go to Mission Control →</Link>
            </>
          )}
        </div>
      ) : (
        /* Runs table */
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Run</th>
                <th className="text-left px-4 py-2.5">Agent</th>
                <th className="text-left px-4 py-2.5">
                  <span className="flex items-center gap-1">
                    Model
                    <Tooltip content="The AI model used for this run. Agents may escalate from their default model to a more powerful one." />
                  </span>
                </th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">
                  <span className="flex items-center gap-1 justify-end">
                    Tokens
                    <Tooltip content="Input + output tokens. Tokens are the units of text processed by the model. More tokens = higher cost." />
                  </span>
                </th>
                <th className="text-right px-4 py-2.5">Cost</th>
                <th className="text-right px-4 py-2.5">Duration</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRuns.map((run) => {
                const agent = agents.find(a => a.id === run.agent_id);
                return (
                  <tr key={run.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/runs/${run.id}`} className="group">
                        <div className="text-[13px] font-medium group-hover:text-blue-400 transition-colors flex items-center gap-1">
                          {run.task_title}
                          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">{run.id}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {agent && <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />}
                        <span className="text-[13px]">{run.agent_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ModelBadge model={run.actual_model_used} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-[12px] font-mono">{formatTokens(run.input_tokens + run.output_tokens)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatTokens(run.input_tokens)} in / {formatTokens(run.output_tokens)} out
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-medium">
                      {formatCost(run.estimated_cost)}
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] text-muted-foreground">
                      {formatDuration(run.started_at, run.ended_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-0.5 justify-end">
                        {run.status === 'failed' && (
                          <button className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground" title="Retry this run with the same agent and model">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(run.status === 'failed' || run.status === 'stalled') && (
                          <button className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground" title="Reassign to a different agent">
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {run.status === 'running' && (
                          <button className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground" title="Pause this run">
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {['running', 'stalled'].includes(run.status) && (
                          <button className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400" title="Stop this run">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
