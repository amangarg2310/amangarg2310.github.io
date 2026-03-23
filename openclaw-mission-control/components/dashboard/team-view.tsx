'use client';

import { runs, agents, tasks } from '@/lib/mock-data';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ModelBadge } from '@/components/ui/model-badge';
import { Tooltip } from '@/components/ui/tooltip';
import { formatCost, formatDuration, cn } from '@/lib/utils';
import { GitBranch, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function TeamView() {
  // Find multi-agent workflows: tasks with multiple runs from different agents
  const activeTaskIds = [...new Set(runs.filter(r => ['running', 'needs_approval'].includes(r.status)).map(r => r.task_id))];

  // Group runs by parent task to show collaboration
  const taskGroups = activeTaskIds.map(taskId => {
    const task = tasks.find(t => t.id === taskId);
    const taskRuns = runs.filter(r => r.task_id === taskId);
    const involvedAgentIds = [...new Set(taskRuns.map(r => r.agent_id))];
    const involvedAgents = involvedAgentIds.map(id => agents.find(a => a.id === id)).filter(Boolean);
    const totalCost = taskRuns.reduce((sum, r) => sum + r.estimated_cost, 0);
    const hasChildren = taskRuns.some(r => r.parent_run_id);

    return { task, runs: taskRuns, agents: involvedAgents, totalCost, hasChildren };
  }).filter(g => g.task);

  if (taskGroups.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-purple-400" />
        <h3 className="text-sm font-medium">Active Agent Teams</h3>
        <Tooltip content="Tasks being worked on by one or more agents, including sub-tasks delegated to specialized agents" />
      </div>

      <div className="divide-y divide-border">
        {taskGroups.map(group => (
          <div key={group.task!.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium">{group.task!.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{group.runs.length} runs · {formatCost(group.totalCost)}</div>
              </div>
              <StatusBadge status={group.task!.status} />
            </div>

            {/* Agent pipeline visualization */}
            <div className="mt-3 flex items-center gap-1 flex-wrap">
              {group.runs.map((run, i) => {
                const runAgent = agents.find(a => a.id === run.agent_id);
                if (!runAgent) return null;
                return (
                  <div key={run.id} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                    <Link
                      href={`/runs/${run.id}`}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors',
                        run.status === 'running'
                          ? 'border-blue-500/30 bg-blue-500/5'
                          : run.status === 'completed'
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : run.status === 'needs_approval'
                          ? 'border-amber-500/20 bg-amber-500/5'
                          : 'border-border hover:bg-white/[0.03]'
                      )}
                    >
                      <AgentAvatar name={runAgent.name} color={runAgent.avatar_color} size="sm" />
                      <div>
                        <div className="text-[11px] font-medium">{runAgent.name}</div>
                        <div className="text-[9px] text-muted-foreground">
                          <ModelBadge model={run.actual_model_used} /> · {formatCost(run.estimated_cost)}
                        </div>
                      </div>
                      <StatusBadge status={run.status} size="sm" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
