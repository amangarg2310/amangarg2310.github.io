'use client';

import { useState } from 'react';
import { agents } from '@/lib/mock-data';
import { Agent } from '@/lib/types';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ModelBadge } from '@/components/ui/model-badge';
import { PageHeader } from '@/components/ui/page-header';
import { formatCost } from '@/lib/utils';
import {
  Plus,
  Search,
  Pencil,
  Copy,
  Archive,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Activity,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AgentsPage() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filteredAgents = agents.filter(a => {
    if (filter === 'active') return a.is_active;
    if (filter === 'inactive') return !a.is_active;
    return true;
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title="Agents" description="Manage your AI agent fleet">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agents..."
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
                  filter === f
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
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
            <Plus className="h-3.5 w-3.5" />
            New Agent
          </button>
        </div>
      </PageHeader>

      {/* Agent cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            expanded={expandedAgent === agent.id}
            onToggle={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
          />
        ))}
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && <CreateAgentModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

function AgentCard({ agent, expanded, onToggle }: { agent: Agent; expanded: boolean; onToggle: () => void }) {
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

        {/* Models */}
        <div className="flex items-center gap-2 mt-3">
          <ModelBadge model={agent.default_model} />
          <span className="text-[10px] text-muted-foreground">→</span>
          <ModelBadge model={agent.escalation_model} />
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

        {/* Expand for system prompt */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1 mt-3 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          System prompt
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
        <button className="p-1.5 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground" title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button className="p-1.5 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground" title="Duplicate">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button className="p-1.5 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground" title="Archive">
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-[#111113] p-6 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Create New Agent</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
            <input className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] outline-none focus:border-blue-500/50" placeholder="e.g. Researcher" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
            <input className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] outline-none focus:border-blue-500/50" placeholder="What does this agent do?" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">System Prompt</label>
            <textarea className="mt-1 w-full h-24 rounded-md border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-blue-500/50 resize-none" placeholder="You are..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Default Model</label>
              <select className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] outline-none">
                <option>gpt-4o-mini</option>
                <option>claude-3.5-haiku</option>
                <option>gpt-4o</option>
                <option>claude-3.5-sonnet</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Escalation Model</label>
              <select className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] outline-none">
                <option>claude-3.5-sonnet</option>
                <option>gpt-4o</option>
                <option>claude-3-opus</option>
                <option>gpt-4-turbo</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Max Budget per Run</label>
            <div className="relative mt-1">
              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input className="w-full h-9 rounded-md border border-border bg-card pl-8 pr-3 text-[13px] outline-none focus:border-blue-500/50" type="number" step="0.10" defaultValue="0.50" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors">
            Create Agent
          </button>
        </div>
      </div>
    </div>
  );
}
