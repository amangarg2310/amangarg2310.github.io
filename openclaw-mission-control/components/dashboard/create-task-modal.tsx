'use client';

import { useState } from 'react';
import { agents } from '@/lib/mock-data';
import { MODEL_PRICING, estimateCost, getModelTier, getTierLabel, getTierColor } from '@/lib/costs';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { Tooltip } from '@/components/ui/tooltip';
import { formatCost, cn } from '@/lib/utils';
import {
  X,
  DollarSign,
  Bot,
  ChevronRight,
  Info,
  Sparkles,
  Eye,
  FileText,
  ShieldCheck,
  Zap,
} from 'lucide-react';

const autonomyLevels = [
  { id: 'observe', label: 'Observe & Suggest', icon: Eye, description: 'Agent analyzes but never acts. You decide what to do.', color: 'border-zinc-500/30 text-zinc-400' },
  { id: 'plan', label: 'Plan & Propose', icon: FileText, description: 'Agent creates a plan for your review before executing.', color: 'border-blue-500/30 text-blue-400' },
  { id: 'confirm', label: 'Act with Confirmation', icon: ShieldCheck, description: 'Agent prepares actions, waits for your go-ahead.', color: 'border-amber-500/30 text-amber-400' },
  { id: 'autonomous', label: 'Fully Autonomous', icon: Zap, description: 'Agent runs independently and notifies you when done.', color: 'border-emerald-500/30 text-emerald-400' },
] as const;

interface CreateTaskModalProps {
  onClose: () => void;
}

export function CreateTaskModal({ onClose }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [modelOverride, setModelOverride] = useState<string>('');
  const [autonomy, setAutonomy] = useState<string>('confirm');

  const activeAgents = agents.filter(a => a.is_active);
  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const effectiveModel = modelOverride || selectedAgent?.default_model || 'gpt-4o-mini';

  const tokenEstimates: Record<string, { input: number; output: number }> = {
    low: { input: 5000, output: 2000 },
    medium: { input: 15000, output: 8000 },
    high: { input: 30000, output: 15000 },
    critical: { input: 50000, output: 25000 },
  };
  const estimate = tokenEstimates[priority];

  // Cost comparison across tiers
  const cheapModel = 'gpt-4o-mini';
  const midModel = 'claude-3.5-sonnet';
  const premiumModel = 'claude-3-opus';
  const costCheap = estimateCost(cheapModel, estimate.input, estimate.output);
  const costMid = estimateCost(midModel, estimate.input, estimate.output);
  const costPremium = estimateCost(premiumModel, estimate.input, estimate.output);
  const costEffective = estimateCost(effectiveModel, estimate.input, estimate.output);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-[#111113] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-[#111113] z-10">
          <div>
            <h2 className="text-base font-semibold">Create New Task</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Describe what you need done, pick an agent, and set how much control you want</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Task title */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground">What do you need done?</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1.5 w-full h-10 rounded-md border border-border bg-card px-3 text-[14px] outline-none focus:border-blue-500/50"
              placeholder='e.g. "Research competitor pricing for Q2"'
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground">Details (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="mt-1.5 w-full h-20 rounded-md border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-blue-500/50 resize-none"
              placeholder="Add any extra context, constraints, or deliverables..."
            />
          </div>

          {/* Agent selection */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" /> Assign to an agent
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {activeAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => { setSelectedAgentId(agent.id); setModelOverride(''); }}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all',
                    selectedAgentId === agent.id
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-border hover:border-zinc-600 hover:bg-white/[0.02]'
                  )}
                >
                  <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{agent.name}</div>
                    <div className="text-[10px] text-muted-foreground">{agent.specialization} · avg {formatCost(agent.avg_cost_per_run || 0)}/run</div>
                  </div>
                  {selectedAgentId === agent.id && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                </button>
              ))}
            </div>
            {!selectedAgentId && (
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Pick the agent best suited for this task. Each agent has different skills and cost profiles.
              </p>
            )}
          </div>

          {/* Autonomy Level */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground flex items-center gap-1.5">
              Agent Autonomy
              <Tooltip content="Controls how much freedom the agent has. Higher autonomy = faster but less oversight. Lower = safer but requires your input." />
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {autonomyLevels.map(level => {
                const LevelIcon = level.icon;
                return (
                  <button
                    key={level.id}
                    onClick={() => setAutonomy(level.id)}
                    className={cn(
                      'flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-all',
                      autonomy === level.id
                        ? level.color + ' bg-white/[0.03]'
                        : 'border-border text-muted-foreground hover:bg-white/[0.02]'
                    )}
                  >
                    <LevelIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[11px] font-medium">{level.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{level.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority + Model row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground">Priority</label>
              <div className="flex gap-1 mt-1.5">
                {(['low', 'medium', 'high', 'critical'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={cn(
                      'flex-1 py-1.5 rounded text-[11px] font-medium capitalize transition-colors border',
                      priority === p
                        ? p === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : p === 'high' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : p === 'medium' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400'
                        : 'border-border text-muted-foreground hover:bg-white/5'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground flex items-center gap-1">
                Model <span className="text-[10px] font-normal">(override agent default)</span>
              </label>
              <select
                value={modelOverride}
                onChange={e => setModelOverride(e.target.value)}
                className="mt-1.5 w-full h-9 rounded-md border border-border bg-card px-2.5 text-[12px] outline-none font-mono"
              >
                <option value="">
                  {selectedAgent ? `${selectedAgent.default_model} (agent default)` : 'Select an agent first'}
                </option>
                {Object.entries(MODEL_PRICING).map(([model, pricing]) => (
                  <option key={model} value={model}>
                    {model} — {getTierLabel(pricing.tier)} · ${pricing.input}/{pricing.output} per 1M tok
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cost comparison across tiers */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 bg-white/[0.02] border-b border-border flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[12px] font-medium">Cost Comparison</span>
              <Tooltip content="Estimated cost for this task across different model tiers, based on typical token usage for the selected priority" />
            </div>
            <div className="grid grid-cols-3 divide-x divide-border">
              <div className={cn('px-3 py-2.5 text-center', effectiveModel === cheapModel || getModelTier(effectiveModel) === 'cheap' ? 'bg-emerald-500/5' : '')}>
                <div className="text-[10px] text-emerald-400 font-medium">Economy</div>
                <div className="text-[14px] font-semibold mt-0.5">{formatCost(costCheap)}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{cheapModel}</div>
              </div>
              <div className={cn('px-3 py-2.5 text-center', getModelTier(effectiveModel) === 'mid' ? 'bg-blue-500/5' : '')}>
                <div className="text-[10px] text-blue-400 font-medium">Standard</div>
                <div className="text-[14px] font-semibold mt-0.5">{formatCost(costMid)}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{midModel}</div>
              </div>
              <div className={cn('px-3 py-2.5 text-center', getModelTier(effectiveModel) === 'premium' ? 'bg-amber-500/5' : '')}>
                <div className="text-[10px] text-amber-400 font-medium">Premium</div>
                <div className="text-[14px] font-semibold mt-0.5">{formatCost(costPremium)}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{premiumModel}</div>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-white/[0.01] border-t border-border text-[10px] text-muted-foreground text-center">
              Based on ~{(estimate.input / 1000).toFixed(0)}K input + {(estimate.output / 1000).toFixed(0)}K output tokens ({priority} priority)
            </div>
          </div>

          {/* Budget warning */}
          {selectedAgent && costEffective > selectedAgent.max_budget_per_run && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Estimated cost exceeds {selectedAgent.name}&apos;s budget of {formatCost(selectedAgent.max_budget_per_run)}/run. The run may be paused for approval.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-white/[0.01] sticky bottom-0">
          <div className="text-[11px] text-muted-foreground">
            {selectedAgent ? (
              <span>
                <strong className="text-foreground">{selectedAgent.name}</strong> · {effectiveModel} · {autonomyLevels.find(l => l.id === autonomy)?.label}
              </span>
            ) : (
              <span>Select an agent to continue</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              disabled={!title.trim() || !selectedAgentId}
              className={cn(
                'px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-1.5',
                title.trim() && selectedAgentId
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              )}
            >
              Create & Run <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
