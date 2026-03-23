'use client';

import { use } from 'react';
import Link from 'next/link';
import { runs, runEvents, agents, tasks } from '@/lib/mock-data';
import { StatusBadge } from '@/components/ui/status-badge';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { ModelBadge } from '@/components/ui/model-badge';
import { PageHeader } from '@/components/ui/page-header';
import { formatCost, formatTokens, formatDuration, timeAgo, cn } from '@/lib/utils';
import {
  ArrowLeft,
  Clock,
  Zap,
  DollarSign,
  RotateCcw,
  Pause,
  XCircle,
  Play,
  Wrench,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  GitBranch,
  Bot,
} from 'lucide-react';

const eventIcons: Record<string, typeof Clock> = {
  started: Play,
  model_called: Zap,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  error: AlertCircle,
  retry: RotateCcw,
  completed: CheckCircle2,
  escalated: ArrowRight,
  child_spawned: GitBranch,
};

const eventColors: Record<string, string> = {
  started: 'text-blue-400 bg-blue-400/10',
  model_called: 'text-purple-400 bg-purple-400/10',
  tool_call: 'text-cyan-400 bg-cyan-400/10',
  tool_result: 'text-emerald-400 bg-emerald-400/10',
  error: 'text-red-400 bg-red-400/10',
  retry: 'text-amber-400 bg-amber-400/10',
  completed: 'text-emerald-400 bg-emerald-400/10',
  escalated: 'text-amber-400 bg-amber-400/10',
  child_spawned: 'text-violet-400 bg-violet-400/10',
};

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const run = runs.find(r => r.id === id);
  const events = runEvents.filter(e => e.run_id === id);
  const agent = run ? agents.find(a => a.id === run.agent_id) : null;
  const task = run ? tasks.find(t => t.id === run.task_id) : null;
  const childRuns = runs.filter(r => r.parent_run_id === id);

  if (!run) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Run not found</p>
          <Link href="/runs" className="text-blue-400 text-sm mt-2 inline-block">← Back to runs</Link>
        </div>
      </div>
    );
  }

  const totalEventCost = events.reduce((sum, e) => sum + (e.estimated_cost || 0), 0);
  const totalEventTokens = events.reduce((sum, e) => sum + (e.input_tokens || 0) + (e.output_tokens || 0), 0);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/runs" className="p-1.5 rounded-md border border-border hover:bg-white/5 transition-colors">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{run.task_title}</h1>
            <StatusBadge status={run.status} size="md" />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[12px] text-muted-foreground">
            <span className="font-mono">{run.id}</span>
            {run.parent_run_id && (
              <>
                <span>·</span>
                <span>Child of <Link href={`/runs/${run.parent_run_id}`} className="text-blue-400 hover:underline">{run.parent_run_id}</Link></span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {run.status === 'failed' && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[12px] hover:bg-white/5 transition-colors">
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </button>
          )}
          {run.status === 'running' && (
            <>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[12px] hover:bg-white/5 transition-colors">
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-500/30 text-red-400 text-[12px] hover:bg-red-500/10 transition-colors">
                <XCircle className="h-3.5 w-3.5" /> Kill
              </button>
            </>
          )}
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Agent</div>
          <div className="flex items-center gap-2 mt-1.5">
            {agent && <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />}
            <span className="text-[13px] font-medium">{run.agent_name}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</div>
          <div className="mt-1.5"><ModelBadge model={run.actual_model_used} /></div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</div>
          <div className="text-[13px] font-medium mt-1.5 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDuration(run.started_at, run.ended_at)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</div>
          <div className="text-[13px] font-medium mt-1.5 flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-yellow-400" />
            {formatTokens(run.input_tokens + run.output_tokens)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {formatTokens(run.input_tokens)} in · {formatTokens(run.output_tokens)} out
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</div>
          <div className="text-[13px] font-semibold mt-1.5 flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            {formatCost(run.estimated_cost)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Retries</div>
          <div className="text-[13px] font-medium mt-1.5 flex items-center gap-1">
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            {run.retry_count}
          </div>
        </div>
      </div>

      {/* Child runs */}
      {childRuns.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-medium">Child Runs ({childRuns.length})</h3>
          </div>
          {childRuns.map(child => (
            <Link
              key={child.id}
              href={`/runs/${child.id}`}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-[12px] font-mono text-muted-foreground">{child.id}</span>
              <span className="text-[13px]">{child.task_title}</span>
              <StatusBadge status={child.status} size="sm" className="ml-auto" />
              <span className="text-[12px] text-muted-foreground">{formatCost(child.estimated_cost)}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Event Timeline */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Event Timeline</h3>
          {events.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {events.length} events · {formatTokens(totalEventTokens)} tokens · {formatCost(totalEventCost)}
            </p>
          )}
        </div>

        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No events recorded for this run yet.
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[27px] top-0 bottom-0 w-px bg-border" />

            {events.map((event, i) => {
              const Icon = eventIcons[event.event_type] || Clock;
              const colorClass = eventColors[event.event_type] || 'text-zinc-400 bg-zinc-400/10';

              return (
                <div key={event.id} className="relative flex items-start gap-3 px-4 py-3 hover:bg-white/[0.01]">
                  <div className={cn('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colorClass)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{event.summary}</span>
                      {event.tool_name && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground font-mono">
                          {event.tool_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span>{timeAgo(event.timestamp)}</span>
                      {event.input_tokens && event.output_tokens && (
                        <span>{formatTokens(event.input_tokens + event.output_tokens)} tokens</span>
                      )}
                      {event.estimated_cost && (
                        <span>{formatCost(event.estimated_cost)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
