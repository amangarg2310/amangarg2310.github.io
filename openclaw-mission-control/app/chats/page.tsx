'use client';

import { useState } from 'react';
import { conversations, messages, agents } from '@/lib/mock-data';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ModelBadge } from '@/components/ui/model-badge';
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
} from 'lucide-react';

export default function ChatsPage() {
  const [selectedConv, setSelectedConv] = useState(conversations[1]); // auth middleware conv
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const agent = agents.find(a => a.id === selectedConv.agent_id);
  const convMessages = messages.filter(m => m.conversation_id === selectedConv.id);

  const toggleTool = (msgId: string) => {
    setExpandedTools(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  return (
    <div className="flex h-full">
      {/* Left sidebar: conversation list */}
      <div className="w-72 border-r border-border flex flex-col bg-[#0c0c0f]">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Conversations</h2>
        </div>
        <div className="flex-1 overflow-auto">
          {conversations.map((conv) => {
            const convAgent = agents.find(a => a.id === conv.agent_id);
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border transition-colors',
                  selectedConv.id === conv.id
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
          })}
        </div>
      </div>

      {/* Center: chat transcript */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          {agent && <AgentAvatar name={agent.name} color={agent.avatar_color} />}
          <div>
            <h2 className="text-sm font-semibold">{selectedConv.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-muted-foreground">{agent?.name}</span>
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
              {msg.role === 'assistant' && agent && (
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
                          {expandedTools[tc.id] ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )}
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
              placeholder="Send a message..."
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
            <button className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right sidebar: metadata */}
      <div className="w-64 border-l border-border bg-[#0c0c0f] p-4 space-y-5">
        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Agent</h3>
          {agent && (
            <div className="flex items-center gap-2">
              <AgentAvatar name={agent.name} color={agent.avatar_color} size="sm" />
              <div>
                <div className="text-[13px] font-medium">{agent.name}</div>
                <div className="text-[11px] text-muted-foreground">{agent.specialization}</div>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Status</h3>
          <StatusBadge status={selectedConv.status === 'active' ? 'running' : 'completed'} size="md" />
        </div>

        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Model</h3>
          {agent && <ModelBadge model={agent.default_model} />}
        </div>

        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Cost</h3>
          <div className="text-lg font-semibold">{formatCost(selectedConv.total_cost)}</div>
          <div className="text-[11px] text-muted-foreground">{selectedConv.message_count} messages</div>
        </div>

        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Actions</h3>
          <div className="space-y-1.5">
            <button className="w-full text-left text-[12px] px-2.5 py-1.5 rounded border border-border hover:bg-white/[0.04] transition-colors text-muted-foreground">
              <Bot className="h-3 w-3 inline mr-1.5" />Hand off to another agent
            </button>
            <button className="w-full text-left text-[12px] px-2.5 py-1.5 rounded border border-border hover:bg-white/[0.04] transition-colors text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1.5" />Pause run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
