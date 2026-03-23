'use client';

import { useState } from 'react';
import { conversations, messages, agents } from '@/lib/mock-data';
import { MODEL_PRICING, getModelTier, getTierLabel, getTierColor } from '@/lib/costs';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ModelBadge } from '@/components/ui/model-badge';
import { Tooltip } from '@/components/ui/tooltip';
import { formatCost, formatTokens, timeAgo, cn } from '@/lib/utils';
import {
  Send,
  ChevronDown,
  ChevronRight,
  Wrench,
  Clock,
  Coins,
  Zap,
  Bot,
  Plus,
  ArrowRightLeft,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';

export default function ChatsPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(conversations[1]?.id || null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const selectedConv = conversations.find(c => c.id === selectedConvId);
  const agent = selectedConv ? agents.find(a => a.id === selectedConv.agent_id) : null;
  const convMessages = selectedConv ? messages.filter(m => m.conversation_id === selectedConv.id) : [];

  const toggleTool = (toolId: string) => {
    setExpandedTools(prev => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    // Mock: in production this would send to the agent API
    setInputValue('');
  };

  return (
    <div className="flex h-full">
      {/* Left sidebar: conversation list */}
      <div className="w-72 border-r border-border flex flex-col bg-[#0c0c0f]">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <button
            onClick={() => setShowNewChat(true)}
            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {conversations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-[12px] text-muted-foreground">No conversations yet</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-2 text-[12px] text-blue-400 hover:text-blue-300"
              >
                Start your first chat →
              </button>
            </div>
          ) : (
            conversations.map((conv) => {
              const convAgent = agents.find(a => a.id === conv.agent_id);
              return (
                <button
                  key={conv.id}
                  onClick={() => { setSelectedConvId(conv.id); setShowNewChat(false); }}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-border transition-colors',
                    selectedConvId === conv.id
                      ? 'bg-white/[0.06]'
                      : 'hover:bg-white/[0.03]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {convAgent && (
                      <AgentAvatar name={convAgent.name} color={convAgent.avatar_color} size="sm" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{conv.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{convAgent?.name}</span>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className="text-[11px] text-muted-foreground">{timeAgo(conv.last_message_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusBadge status={conv.status === 'active' ? 'running' : 'completed'} size="sm" />
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatCost(conv.total_cost)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Center: new chat flow or conversation */}
      {showNewChat ? (
        <NewChatView
          onStartChat={(agentId) => {
            // Mock: would create a new conversation
            setShowNewChat(false);
            setSelectedConvId(conversations[0]?.id || null);
          }}
          onCancel={() => setShowNewChat(false)}
        />
      ) : selectedConv && agent ? (
        <>
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-border flex items-center gap-3">
              <AgentAvatar name={agent.name} color={agent.avatar_color} />
              <div>
                <h2 className="text-sm font-semibold">{selectedConv.title}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground">{agent.name}</span>
                  <StatusBadge status={selectedConv.status === 'active' ? 'running' : 'completed'} size="sm" />
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Coins className="h-3 w-3" />{formatCost(selectedConv.total_cost)}</span>
                <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{selectedConv.message_count} msgs</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              {convMessages.map((msg) => (
                <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : '')}>
                  {msg.role === 'assistant' && (
                    <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" className="mt-0.5 shrink-0" />
                  )}
                  <div className={cn(
                    'max-w-[640px] rounded-lg px-4 py-3',
                    msg.role === 'user'
                      ? 'bg-blue-600/20 border border-blue-500/20'
                      : 'bg-card border border-border'
                  )}>
                    <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</div>

                    {/* Tool calls */}
                    {msg.tool_calls && msg.tool_calls.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {msg.tool_calls.map((tc) => (
                          <div key={tc.id} className="rounded border border-white/5 bg-white/[0.02]">
                            <button
                              onClick={() => toggleTool(tc.id)}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
                            >
                              {expandedTools[tc.id] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                              <Wrench className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[11px] font-mono text-muted-foreground">{tc.name}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto">{tc.duration_ms}ms</span>
                            </button>
                            {expandedTools[tc.id] && (
                              <div className="px-3 pb-2 space-y-1">
                                <div className="text-[11px] text-muted-foreground">
                                  <span className="text-zinc-500">Input:</span>
                                  <code className="ml-1 text-zinc-400">{tc.input}</code>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  <span className="text-zinc-500">Output:</span>
                                  <code className="ml-1 text-zinc-400">{tc.output}</code>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message metadata */}
                    {msg.role === 'assistant' && msg.model && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                        <ModelBadge model={msg.model} />
                        {msg.input_tokens && msg.output_tokens && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatTokens(msg.input_tokens + msg.output_tokens)} tokens
                          </span>
                        )}
                        {msg.estimated_cost && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatCost(msg.estimated_cost)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {timeAgo(msg.created_at)}
                        </span>
                      </div>
                    )}
                    {msg.role === 'user' && (
                      <div className="flex justify-end mt-1">
                        <span className="text-[10px] text-muted-foreground">{timeAgo(msg.created_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="px-5 py-3 border-t border-border">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
                <input
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder={`Message ${agent.name}...`}
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    inputValue.trim()
                      ? 'hover:bg-blue-600/20 text-blue-400'
                      : 'text-muted-foreground/50 cursor-not-allowed'
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-1.5 px-1">
                <span className="text-[10px] text-muted-foreground">
                  Using <ModelBadge model={agent.default_model} /> · Escalates to {agent.escalation_model}
                </span>
              </div>
            </div>
          </div>

          {/* Right sidebar: metadata */}
          <div className="w-64 border-l border-border bg-[#0c0c0f] p-4 space-y-5 overflow-auto">
            <div>
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Agent</h3>
              <div className="flex items-center gap-2">
                <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
                <div>
                  <div className="text-[13px] font-medium">{agent.name}</div>
                  <div className="text-[11px] text-muted-foreground">{agent.specialization}</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Status</h3>
              <StatusBadge status={selectedConv.status === 'active' ? 'running' : 'completed'} size="md" />
            </div>

            <div>
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                Model
                <Tooltip content="The AI model processing this conversation. Cheaper models are used first; escalation happens for harder tasks." />
              </h3>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Default:</span>
                  <ModelBadge model={agent.default_model} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Escalation:</span>
                  <ModelBadge model={agent.escalation_model} />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Cost</h3>
              <div className="text-lg font-semibold">{formatCost(selectedConv.total_cost)}</div>
              <div className="text-[11px] text-muted-foreground">{selectedConv.message_count} messages</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Budget: {formatCost(agent.max_budget_per_run)}/run
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Actions</h3>
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowHandoff(true)}
                  className="w-full text-left text-[12px] px-2.5 py-1.5 rounded border border-border hover:bg-white/[0.04] transition-colors text-muted-foreground flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="h-3 w-3" />Hand off to another agent
                </button>
                <button className="w-full text-left text-[12px] px-2.5 py-1.5 rounded border border-border hover:bg-white/[0.04] transition-colors text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />Pause run
                </button>
              </div>
            </div>
          </div>

          {/* Handoff modal */}
          {showHandoff && (
            <HandoffModal
              currentAgentId={agent.id}
              onClose={() => setShowHandoff(false)}
              onHandoff={(agentId) => { setShowHandoff(false); }}
            />
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto opacity-30" />
            <p className="text-[13px] text-muted-foreground">Select a conversation or start a new one</p>
            <button
              onClick={() => setShowNewChat(true)}
              className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              + New Conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewChatView({ onStartChat, onCancel }: { onStartChat: (agentId: string) => void; onCancel: () => void }) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const activeAgents = agents.filter(a => a.is_active);

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold">New Conversation</h2>
        <button onClick={onCancel} className="p-1 rounded hover:bg-white/10 text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 p-6 max-w-xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2 pt-4">
          <Sparkles className="h-8 w-8 text-blue-400 mx-auto" />
          <h3 className="text-base font-semibold">Start a conversation with an agent</h3>
          <p className="text-[13px] text-muted-foreground">Pick an agent and describe what you need. The agent will start working on it immediately.</p>
        </div>

        {/* Agent selection */}
        <div className="space-y-2">
          <label className="text-[12px] font-medium text-muted-foreground">Choose an agent</label>
          <div className="grid grid-cols-2 gap-2">
            {activeAgents.map(agent => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all',
                  selectedAgentId === agent.id
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-border hover:border-zinc-600 hover:bg-white/[0.02]'
                )}
              >
                <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
                <div>
                  <div className="text-[13px] font-medium">{agent.name}</div>
                  <div className="text-[10px] text-muted-foreground">{agent.specialization}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Message input */}
        <div>
          <label className="text-[12px] font-medium text-muted-foreground">What do you need?</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={selectedAgentId ? `Tell ${agents.find(a => a.id === selectedAgentId)?.name} what to do...` : 'Select an agent first...'}
            className="mt-1.5 w-full h-28 rounded-md border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-blue-500/50 resize-none"
            disabled={!selectedAgentId}
          />
        </div>

        {/* Selected agent info */}
        {selectedAgentId && (() => {
          const a = agents.find(x => x.id === selectedAgentId)!;
          return (
            <div className="rounded-lg bg-white/[0.03] border border-border p-3 text-[11px] text-muted-foreground space-y-1">
              <div><strong className="text-foreground">{a.name}</strong> uses <ModelBadge model={a.default_model} /> by default, escalates to <ModelBadge model={a.escalation_model} /></div>
              <div>Budget: {formatCost(a.max_budget_per_run)}/run · Avg cost: {formatCost(a.avg_cost_per_run || 0)}/run</div>
              <div>Tools: {a.allowed_tools.map(t => <span key={t} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-white/5 font-mono text-[10px]">{t}</span>)}</div>
            </div>
          );
        })()}

        <button
          onClick={() => selectedAgentId && onStartChat(selectedAgentId)}
          disabled={!selectedAgentId || !message.trim()}
          className={cn(
            'w-full py-2.5 rounded-md text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5',
            selectedAgentId && message.trim()
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
          )}
        >
          <Send className="h-3.5 w-3.5" /> Start Conversation
        </button>
      </div>
    </div>
  );
}

function HandoffModal({ currentAgentId, onClose, onHandoff }: { currentAgentId: string; onClose: () => void; onHandoff: (agentId: string) => void }) {
  const otherAgents = agents.filter(a => a.is_active && a.id !== currentAgentId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-[#111113] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Hand off to another agent</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Transfer this conversation to a different agent. The new agent will have access to the full conversation history.
        </p>
        <div className="space-y-2">
          {otherAgents.map(agent => (
            <button
              key={agent.id}
              onClick={() => onHandoff(agent.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-blue-500/30 hover:bg-blue-500/5 transition-all text-left"
            >
              <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
              <div className="flex-1">
                <div className="text-[13px] font-medium">{agent.name}</div>
                <div className="text-[10px] text-muted-foreground">{agent.specialization} · {agent.default_model}</div>
              </div>
              <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
