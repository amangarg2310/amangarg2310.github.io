'use client';

import { useState } from 'react';
import { agents } from '@/lib/mock-data';
import { Agent } from '@/lib/types';
import { MODEL_PRICING, getModelTier, getTierLabel, getTierColor } from '@/lib/costs';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ModelBadge } from '@/components/ui/model-badge';
import { PageHeader } from '@/components/ui/page-header';
import { Tooltip } from '@/components/ui/tooltip';
import { formatCost, cn } from '@/lib/utils';
import {
  Plus,
  Search,
  Pencil,
  Copy,
  Archive,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Wrench,
  X,
  Bot,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';

export default function AgentsPage() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAgents = agents.filter(a => {
    if (filter === 'active' && !a.is_active) return false;
    if (filter === 'inactive' && a.is_active) return false;
    if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase()) && !a.specialization.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title="Agents" description="Create and manage your AI agent team">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 w-48 rounded-md border border-border bg-card pl-8 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-blue-500/50"
            />
          </div>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-medium transition-colors capitalize',
                  filter === f ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Agent
          </button>
        </div>
      </PageHeader>

      {/* Empty state */}
      {filteredAgents.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-white/[0.01] py-12 text-center space-y-3">
          <Bot className="h-10 w-10 text-muted-foreground mx-auto opacity-30" />
          {searchQuery || filter !== 'all' ? (
            <>
              <p className="text-[13px] text-muted-foreground">No agents match your filters</p>
              <button onClick={() => { setFilter('all'); setSearchQuery(''); }} className="text-[12px] text-blue-400">Clear filters</button>
            </>
          ) : (
            <>
              <p className="text-base font-medium">No agents yet</p>
              <p className="text-[13px] text-muted-foreground max-w-sm mx-auto">
                Agents are AI workers with specific skills. Create your first agent to start assigning tasks.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Create Your First Agent
              </button>
            </>
          )}
        </div>
      )}

      {/* Agent cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            expanded={expandedAgent === agent.id}
            onToggle={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
            onEdit={() => setEditingAgent(agent)}
            onDuplicate={() => {
              // Mock: would create a copy
              setShowCreateModal(true);
            }}
          />
        ))}
      </div>

      {/* Create/Edit Agent Modal */}
      {(showCreateModal || editingAgent) && (
        <AgentFormModal
          agent={editingAgent}
          onClose={() => { setShowCreateModal(false); setEditingAgent(null); }}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent, expanded, onToggle, onEdit, onDuplicate,
}: {
  agent: Agent; expanded: boolean; onToggle: () => void; onEdit: () => void; onDuplicate: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <AgentAvatar name={agent.name} color={agent.avatar_color} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{agent.name}</h3>
              <StatusBadge status={agent.status || (agent.is_active ? 'active' : 'inactive')} size="sm" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{agent.specialization}</p>
            <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-2">{agent.description}</p>
          </div>
        </div>

        {/* Model routing - made much more visible */}
        <div className="mt-3 rounded bg-white/[0.02] border border-white/5 p-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            Model Routing
            <Tooltip content="The agent starts with the cheap default model. If the task is too complex, it escalates to the premium model." />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground">Default</div>
              <ModelBadge model={agent.default_model} />
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground">Escalation</div>
              <ModelBadge model={agent.escalation_model} />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded bg-white/[0.03] px-2.5 py-1.5">
            <div className="text-[10px] text-muted-foreground">Runs</div>
            <div className="text-[13px] font-medium">{agent.total_runs}</div>
          </div>
          <div className="rounded bg-white/[0.03] px-2.5 py-1.5">
            <div className="text-[10px] text-muted-foreground">Avg Cost</div>
            <div className="text-[13px] font-medium">{formatCost(agent.avg_cost_per_run || 0)}</div>
          </div>
          <div className="rounded bg-white/[0.03] px-2.5 py-1.5">
            <div className="text-[10px] text-muted-foreground">Budget</div>
            <div className="text-[13px] font-medium">{formatCost(agent.max_budget_per_run)}/run</div>
          </div>
        </div>

        {/* Expand system prompt */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1 mt-3 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          System prompt & personality
        </button>
        {expanded && (
          <div className="mt-2 rounded bg-white/[0.02] border border-white/5 p-3">
            <p className="text-[12px] text-muted-foreground leading-relaxed font-mono">{agent.system_prompt}</p>
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="px-4 py-2.5 border-t border-border flex items-center gap-1.5 flex-wrap">
        <Wrench className="h-3 w-3 text-muted-foreground mr-0.5" />
        {agent.allowed_tools.map(tool => (
          <span key={tool} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground font-mono">
            {tool}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="px-4 py-2 border-t border-border flex items-center gap-1">
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground" title="Edit agent">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDuplicate} className="p-1.5 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground" title="Duplicate agent">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-muted-foreground hover:text-red-400" title="Archive agent">
          <Archive className="h-3.5 w-3.5" />
        </button>
        <span className="ml-auto text-[10px] text-muted-foreground">{agent.total_runs} total runs</span>
      </div>
    </div>
  );
}

function AgentFormModal({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const isEditing = !!agent;
  const [defaultModel, setDefaultModel] = useState(agent?.default_model || 'gpt-4o-mini');
  const [escalationModel, setEscalationModel] = useState(agent?.escalation_model || 'claude-3.5-sonnet');

  const defaultPricing = MODEL_PRICING[defaultModel];
  const escalationPricing = MODEL_PRICING[escalationModel];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-[#111113] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold">{isEditing ? `Edit ${agent.name}` : 'Create New Agent'}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isEditing ? 'Update this agent\'s configuration' : 'Define a new AI worker with specific skills'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
              <input className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] outline-none focus:border-blue-500/50" defaultValue={agent?.name} placeholder="e.g. Researcher" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Specialization</label>
              <input className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] outline-none focus:border-blue-500/50" defaultValue={agent?.specialization} placeholder="e.g. Research & Intel" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
            <input className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] outline-none focus:border-blue-500/50" defaultValue={agent?.description} placeholder="What does this agent do?" />
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              System Prompt / Personality
            </label>
            <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">This defines how the agent behaves, its tone, and approach</p>
            <textarea className="w-full h-28 rounded-md border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-blue-500/50 resize-none font-mono" defaultValue={agent?.system_prompt} placeholder="You are..." />
          </div>

          {/* Model selection - the key UX improvement */}
          <div className="rounded-lg border border-border bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-400" />
              <h3 className="text-[13px] font-medium">Model Routing</h3>
              <Tooltip content="Agents use a cheap model for simple tasks and escalate to a powerful model when needed. This keeps costs low while maintaining quality." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Default Model
                  <span className="text-[9px] ml-1 font-normal">(used first, cheapest)</span>
                </label>
                <select
                  value={defaultModel}
                  onChange={e => setDefaultModel(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-card px-2 text-[12px] outline-none font-mono"
                >
                  {Object.entries(MODEL_PRICING).map(([model, pricing]) => (
                    <option key={model} value={model}>
                      {model} — {getTierLabel(pricing.tier)}
                    </option>
                  ))}
                </select>
                {defaultPricing && (
                  <div className={cn('text-[10px] mt-1', getTierColor(defaultPricing.tier))}>
                    {getTierLabel(defaultPricing.tier)} · ${defaultPricing.input.toFixed(2)} in / ${defaultPricing.output.toFixed(2)} out per 1M
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Escalation Model
                  <span className="text-[9px] ml-1 font-normal">(for complex tasks)</span>
                </label>
                <select
                  value={escalationModel}
                  onChange={e => setEscalationModel(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-card px-2 text-[12px] outline-none font-mono"
                >
                  {Object.entries(MODEL_PRICING).map(([model, pricing]) => (
                    <option key={model} value={model}>
                      {model} — {getTierLabel(pricing.tier)}
                    </option>
                  ))}
                </select>
                {escalationPricing && (
                  <div className={cn('text-[10px] mt-1', getTierColor(escalationPricing.tier))}>
                    {getTierLabel(escalationPricing.tier)} · ${escalationPricing.input.toFixed(2)} in / ${escalationPricing.output.toFixed(2)} out per 1M
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-blue-500/5 border border-blue-500/10 rounded-md px-3 py-2">
              <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span>The agent starts every task with the <strong className="text-foreground">default model</strong>. If the task requires more capability (e.g. complex reasoning, large context), it automatically escalates to the <strong className="text-foreground">escalation model</strong>.</span>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Max Budget per Run</label>
            <div className="relative mt-1">
              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input className="w-full h-9 rounded-md border border-border bg-card pl-8 pr-3 text-[13px] outline-none focus:border-blue-500/50" type="number" step="0.10" defaultValue={agent?.max_budget_per_run || 0.50} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Run pauses for approval if cost exceeds this limit</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors">
            {isEditing ? 'Save Changes' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
