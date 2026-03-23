'use client';

import { runs } from '@/lib/mock-data';
import { agents } from '@/lib/mock-data';
import { StatusBadge } from '@/components/ui/status-badge';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { ModelBadge } from '@/components/ui/model-badge';
import { formatCost, formatTokens, formatDuration } from '@/lib/utils';
import Link from 'next/link';

export function RunStatusBoard() {
  const activeRuns = runs.filter(r => ['running', 'stalled', 'needs_approval', 'failed'].includes(r.status));

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Active Runs</h3>
        <Link href="/runs" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all →
        </Link>
      </div>
      <div className="divide-y divide-border">
        {activeRuns.map((run) => {
          const agent = agents.find(a => a.id === run.agent_id);
          return (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              {agent && (
                <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{run.task_title}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground">{run.agent_name}</span>
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground">{formatDuration(run.started_at, run.ended_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ModelBadge model={run.actual_model_used} />
                <div className="text-right">
                  <div className="text-[11px] text-muted-foreground">{formatTokens(run.input_tokens + run.output_tokens)} tok</div>
                  <div className="text-[11px] text-muted-foreground">{formatCost(run.estimated_cost)}</div>
                </div>
                <StatusBadge status={run.status} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
