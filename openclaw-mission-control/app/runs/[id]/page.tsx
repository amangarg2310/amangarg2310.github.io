'use client';

import { useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { runs, runEvents, agents, tasks } from '@/lib/mock-data';
import { RunEvent } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { ModelBadge } from '@/components/ui/model-badge';
import { Tooltip } from '@/components/ui/tooltip';
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
  Radio,
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

const eventBarColors: Record<string, string> = {
  started: 'bg-blue-500',
  model_called: 'bg-purple-500',
  tool_call: 'bg-cyan-500',
  tool_result: 'bg-emerald-500',
  error: 'bg-red-500',
  retry: 'bg-amber-500',
  completed: 'bg-emerald-500',
  escalated: 'bg-amber-500',
  child_spawned: 'bg-violet-500',
};

const eventBgColors: Record<string, string> = {
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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const run = runs.find(r => r.id === id);
  const events = runEvents.filter(e => e.run_id === id);
  const agent = run ? agents.find(a => a.id === run.agent_id) : null;
  const childRuns = runs.filter(r => r.parent_run_id === id);
  const selectedEvent = events.find(e => e.id === selectedEventId);

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

  // Calculate durations for waterfall bars
  const runStartTime = new Date(run.started_at).getTime();
  const runEndTime = run.ended_at ? new Date(run.ended_at).getTime() : Date.now();
  const totalDuration = runEndTime - runStartTime;

  function getEventDuration(event: RunEvent, index: number): number {
    const nextEvent = events[index + 1];
    const eventTime = new Date(event.timestamp).getTime();
    const endTime = nextEvent ? new Date(nextEvent.timestamp).getTime() : runEndTime;
    return endTime - eventTime;
  }

  function getEventOffset(event: RunEvent): number {
    const eventTime = new Date(event.timestamp).getTime();
    return ((eventTime - runStartTime) / totalDuration) * 100;
  }

  function getEventWidth(event: RunEvent, index: number): number {
    const duration = getEventDuration(event, index);
    return Math.max((duration / totalDuration) * 100, 1.5); // min 1.5% so it's visible
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
            {run.status === 'running' && (
              <span className="flex items-center gap-1 text-[11px] text-blue-400">
                <Radio className="h-3 w-3 animate-pulse" /> Live
              </span>
            )}
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
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            Tokens <Tooltip content="Input + output tokens consumed by this run" />
          </div>
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
            <h3 className="text-sm font-medium">Spawned Sub-Tasks ({childRuns.length})</h3>
            <Tooltip content="This agent broke the task into smaller pieces and assigned them to sub-runs" />
          </div>
          {childRuns.map(child => {
            const childAgent = agents.find(a => a.id === child.agent_id);
            return (
              <Link
                key={child.id}
                href={`/runs/${child.id}`}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                {childAgent && <AgentAvatar name={childAgent.name} color={childAgent.avatar_color} size="sm" />}
                <span className="text-[13px] flex-1">{child.task_title}</span>
                <ModelBadge model={child.actual_model_used} />
                <StatusBadge status={child.status} size="sm" />
                <span className="text-[12px] text-muted-foreground">{formatCost(child.estimated_cost)}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Two-pane Waterfall Timeline */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Event Waterfall</h3>
            {events.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {events.length} events · {formatTokens(totalEventTokens)} tokens · {formatCost(totalEventCost)}
              </p>
            )}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-purple-500" />Model Call</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-cyan-500" />Tool</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Result</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" />Error</span>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No events recorded for this run yet.
          </div>
        ) : (
          <div className="flex min-h-[400px]">
            {/* Left: Waterfall timeline */}
            <div className="flex-1 border-r border-border overflow-auto">
              {events.map((event, i) => {
                const Icon = eventIcons[event.event_type] || Clock;
                const barColor = eventBarColors[event.event_type] || 'bg-zinc-500';
                const bgColor = eventBgColors[event.event_type] || 'text-zinc-400 bg-zinc-400/10';
                const isSelected = selectedEventId === event.id;
                const offset = getEventOffset(event);
                const width = getEventWidth(event, i);
                const durationMs = getEventDuration(event, i);

                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEventId(isSelected ? null : event.id)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 text-left border-b border-border transition-colors',
                      isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                    )}
                  >
                    {/* Icon */}
                    <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', bgColor)}>
                      <Icon className="h-3 w-3" />
                    </div>

                    {/* Label */}
                    <div className="w-36 shrink-0 min-w-0">
                      <div className="text-[11px] font-medium truncate">{event.summary}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                      </div>
                    </div>

                    {/* Waterfall bar */}
                    <div className="flex-1 h-5 bg-white/[0.02] rounded-sm relative overflow-hidden">
                      <div
                        className={cn('absolute top-0.5 bottom-0.5 rounded-sm transition-all', barColor, isSelected ? 'opacity-100' : 'opacity-70')}
                        style={{ left: `${offset}%`, width: `${width}%` }}
                      />
                    </div>

                    {/* Cost/tokens */}
                    <div className="w-16 shrink-0 text-right">
                      {event.estimated_cost ? (
                        <div className="text-[10px] font-medium">{formatCost(event.estimated_cost)}</div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground/50">—</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Event detail pane */}
            <div className="w-80 shrink-0 overflow-auto">
              {selectedEvent ? (
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = eventIcons[selectedEvent.event_type] || Clock;
                      const bgColor = eventBgColors[selectedEvent.event_type] || 'text-zinc-400 bg-zinc-400/10';
                      return (
                        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', bgColor)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                      );
                    })()}
                    <div>
                      <div className="text-[13px] font-medium">{selectedEvent.event_type.replace('_', ' ')}</div>
                      <div className="text-[10px] text-muted-foreground">{timeAgo(selectedEvent.timestamp)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Summary</div>
                    <p className="text-[12px] leading-relaxed">{selectedEvent.summary}</p>
                  </div>

                  {selectedEvent.tool_name && (
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Tool</div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 font-mono">{selectedEvent.tool_name}</span>
                    </div>
                  )}

                  {(selectedEvent.input_tokens || selectedEvent.output_tokens) && (
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Token Usage</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded bg-white/[0.03] px-2.5 py-1.5">
                          <div className="text-[10px] text-muted-foreground">Input</div>
                          <div className="text-[12px] font-mono font-medium">{formatTokens(selectedEvent.input_tokens || 0)}</div>
                        </div>
                        <div className="rounded bg-white/[0.03] px-2.5 py-1.5">
                          <div className="text-[10px] text-muted-foreground">Output</div>
                          <div className="text-[12px] font-mono font-medium">{formatTokens(selectedEvent.output_tokens || 0)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEvent.estimated_cost && (
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Cost</div>
                      <div className="text-lg font-semibold">{formatCost(selectedEvent.estimated_cost)}</div>
                    </div>
                  )}

                  {Object.keys(selectedEvent.metadata).length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Metadata</div>
                      <pre className="text-[11px] font-mono bg-white/[0.02] rounded p-2.5 overflow-auto text-muted-foreground leading-relaxed">
                        {JSON.stringify(selectedEvent.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full p-6 text-center">
                  <div>
                    <Zap className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-30" />
                    <p className="text-[12px] text-muted-foreground">Click an event to see details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
