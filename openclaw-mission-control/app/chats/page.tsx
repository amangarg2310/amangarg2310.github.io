'use client'

import { useState } from 'react'
import { conversations, messages, agents } from '@/lib/mock-data'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { formatCost, formatTokens, timeAgo, cn } from '@/lib/utils'
import {
  Send,
  MessageSquare,
  Terminal,
  Bot,
  User,
  DollarSign,
  Clock,
} from 'lucide-react'

export default function ChatsPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    conversations[1]?.id || null
  )
  const [isTyping] = useState(true)
  const [inputValue, setInputValue] = useState('')

  const selectedConv = conversations.find((c) => c.id === selectedConvId)
  const agent = selectedConv
    ? agents.find((a) => a.id === selectedConv.agent_id)
    : null
  const convMessages = selectedConv
    ? messages.filter((m) => m.conversation_id === selectedConv.id)
    : []

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Left Panel: Chat List */}
      <div className="w-72 border-r border-border flex flex-col bg-[#050506]">
        <div className="p-4 border-b border-border/50">
          <button className="w-full flex items-center justify-center gap-2 bg-card hover:bg-white/5 border border-border text-foreground px-4 py-2 rounded-lg font-medium text-sm transition-colors">
            <MessageSquare className="w-4 h-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {conversations.map((chat) => {
            const chatAgent = agents.find(
              (a) => a.id === chat.agent_id
            )
            return (
              <button
                key={chat.id}
                onClick={() => setSelectedConvId(chat.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedConvId === chat.id
                    ? 'bg-accent/10 border border-accent/20 text-accent'
                    : 'hover:bg-white/5 text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                <div className="text-sm font-medium truncate mb-1">
                  {chat.title}
                </div>
                <div className="text-xs opacity-70">
                  {chatAgent?.name} · {timeAgo(chat.last_message_at)}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Center Panel: Thread */}
      {selectedConv && agent ? (
        <div className="flex-1 flex flex-col relative">
          {/* Header */}
          <header className="h-14 border-b border-border flex items-center px-6 bg-card/30 backdrop-blur-sm z-10">
            <h2 className="text-sm font-medium text-foreground">
              {selectedConv.title}
            </h2>
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {convMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-4`}
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-1">
                    {msg.role === 'user' ? (
                      <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center border border-accent/30">
                        <User className="w-4 h-4" />
                      </div>
                    ) : (
                      <AgentAvatar
                        name={agent.name}
                        color={agent.avatar_color}
                        size="sm"
                      />
                    )}
                  </div>

                  {/* Content Bubble */}
                  <div
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-1.5 ml-1">
                        <span className="text-xs font-medium text-foreground">
                          {agent.name}
                        </span>
                        {msg.model && (
                          <span className="text-[10px] text-muted-foreground font-mono bg-white/5 px-1.5 py-0.5 rounded">
                            {msg.model}
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-accent/10 text-foreground border border-accent/20 rounded-tr-sm'
                          : 'bg-card text-foreground border border-border rounded-tl-sm shadow-sm'
                      }`}
                      style={
                        msg.role === 'assistant'
                          ? {
                              borderLeftWidth: '3px',
                              borderLeftColor: agent.avatar_color,
                            }
                          : {}
                      }
                    >
                      <div className="whitespace-pre-wrap">
                        {msg.content}
                      </div>

                      {/* Tool Call Terminal Block */}
                      {msg.tool_calls &&
                        msg.tool_calls.length > 0 &&
                        msg.tool_calls.map((tc) => (
                          <div
                            key={tc.id}
                            className="mt-4 bg-[#050506] border border-status-tool/30 rounded-lg overflow-hidden"
                          >
                            <div className="bg-status-tool/10 px-3 py-1.5 border-b border-status-tool/20 flex items-center gap-2">
                              <Terminal className="w-3.5 h-3.5 text-status-tool" />
                              <span className="text-xs font-mono text-status-tool font-medium">
                                {tc.name}
                              </span>
                            </div>
                            <div className="p-3 text-xs font-mono text-status-tool/80 space-y-2">
                              <div>
                                <span className="opacity-50">
                                  &gt; Input:
                                </span>{' '}
                                {tc.input}
                              </div>
                              <div className="text-status-success/80">
                                <span className="opacity-50">
                                  &gt; Result:
                                </span>{' '}
                                {tc.output}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Message Footer */}
                    {msg.role === 'assistant' && msg.estimated_cost && (
                      <div className="mt-1.5 ml-1 text-[10px] text-muted-foreground font-mono flex items-center gap-3">
                        <span>
                          {formatTokens(
                            (msg.input_tokens || 0) +
                              (msg.output_tokens || 0)
                          )}{' '}
                          tkns
                        </span>
                        <span>
                          {formatCost(msg.estimated_cost)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex gap-4 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-status-model/20 text-status-model flex items-center justify-center border border-status-model/40 flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-4 flex items-center gap-1 h-12"
                    style={{ borderLeftWidth: '3px', borderLeftColor: agent.avatar_color }}>
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full typing-dot" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full typing-dot" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-background border-t border-border">
            <div className="relative flex items-end bg-card border border-border rounded-xl focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all p-2 shadow-sm">
              <textarea
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Reply to agents or provide new instructions..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none py-2 px-3 max-h-32"
              />
              <button className="p-2 mb-0.5 mr-0.5 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors flex-shrink-0">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto opacity-30" />
            <p className="text-sm text-muted-foreground">
              Select a conversation
            </p>
          </div>
        </div>
      )}

      {/* Right Panel: Metadata Sidebar */}
      {selectedConv && agent && (
        <div className="w-64 border-l border-border bg-card/30 flex flex-col">
          <div className="p-4 border-b border-border/50">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Session Details
            </h3>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto">
            <div className="bg-card border border-border rounded-xl p-3 card-glow">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
                <Bot className="w-4 h-4 text-accent" /> Active Agents
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {agent.name}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-status-running led-pulse" />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-3 card-glow">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
                <DollarSign className="w-4 h-4 text-status-model" />{' '}
                Cost & Usage
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">
                    Total Cost
                  </div>
                  <div className="text-lg font-mono text-foreground tabular-nums">
                    {formatCost(selectedConv.total_cost)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">
                    Messages
                  </div>
                  <div className="text-sm font-mono text-foreground tabular-nums">
                    {selectedConv.message_count}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-3 card-glow">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
                <Clock className="w-4 h-4 text-status-tool" /> Timeline
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-mono text-foreground">
                    {selectedConv.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Last message
                  </span>
                  <span className="font-mono text-foreground">
                    {timeAgo(selectedConv.last_message_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
