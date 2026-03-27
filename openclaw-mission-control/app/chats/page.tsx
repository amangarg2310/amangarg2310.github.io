'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useConversations, useAgents, useConversationDetail } from '@/lib/hooks'
import { sendChatMessage } from '@/lib/api'
import { useActiveProject } from '@/lib/project-context'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { formatCost, formatTokens, timeAgo, cn } from '@/lib/utils'
import {
  MessageSquare,
  Terminal,
  Bot,
  User,
  DollarSign,
  Clock,
  Loader2,
  Send,
} from 'lucide-react'

/**
 * Strip transport/debug metadata from message content.
 * Removes lines like "Conversation info (untrusted metadata)", sender JSON blobs,
 * and internal reply tags that leak from the raw transcript into text blocks.
 */
function cleanMessageContent(content: string): string {
  if (!content) return content
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      // Remove "Conversation info" transport headers
      if (/^conversation info\s*\(/i.test(trimmed)) return false
      // Remove sender JSON blobs like {"sender": ...}
      if (/^\{"sender"\s*:/.test(trimmed)) return false
      // Remove bare JSON objects that look like transport metadata
      if (/^\{".+"\s*:\s*\{/.test(trimmed) && trimmed.length < 300) return false
      // Remove internal reply tags
      if (/<\/?reply\b/i.test(trimmed)) return false
      return true
    })
    .join('\n')
    .trim()
}

export default function ChatsPage() {
  const { activeProjectId } = useActiveProject()
  const { data: conversations } = useConversations(activeProjectId)
  const { data: agents } = useAgents()
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)

  // Auto-select first conversation when data loads
  const activeConvId = selectedConvId || conversations[0]?.id || null
  const selectedConv = conversations.find((c) => c.id === activeConvId)

  // Use transcript-backed detail endpoint instead of simple messages
  const { data: detail, loading: detailLoading } = useConversationDetail(activeConvId || '')
  const convMessages = detail.messages
  const sessionInfo = detail.session

  const agent = selectedConv
    ? agents.find((a) => a.id === selectedConv.agent_id)
    : null

  // Auto-scroll: only scroll to bottom when new messages arrive, not while user is reading history
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const prevMessageCount = useRef(0)

  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return true
    const threshold = 100 // px from bottom
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  useEffect(() => {
    const newCount = convMessages.length
    // Scroll to bottom only if: first load, new messages arrived AND user was near bottom
    if (newCount > 0 && (prevMessageCount.current === 0 || (newCount > prevMessageCount.current && isNearBottom()))) {
      messagesEndRef.current?.scrollIntoView({ behavior: prevMessageCount.current === 0 ? 'auto' : 'smooth' })
    }
    prevMessageCount.current = newCount
  }, [convMessages.length, isNearBottom])

  // Derive honest status labels from session lock state
  const conversationStatus = sessionInfo.isLocked
    ? 'responding'
    : selectedConv?.status === 'active'
      ? 'idle'
      : selectedConv?.status === 'completed'
        ? 'ended'
        : selectedConv?.status || 'idle'

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Left Panel: Chat List */}
      <div className="w-72 border-r border-border flex flex-col bg-[#050506]">
        <div className="p-4 border-b border-border/50">
          <h2 className="text-sm font-medium text-foreground">Conversations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {conversations.length} session{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {conversations.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <MessageSquare className="w-6 h-6 text-muted-foreground/30 mx-auto" />
              <p className="text-xs text-muted-foreground/50">
                No conversations yet
              </p>
              <p className="text-[10px] text-muted-foreground/30">
                Conversations appear as agents start sessions.
              </p>
            </div>
          )}
          {[...conversations]
            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
            .map((chat) => {
            const chatAgent = agents.find(
              (a) => a.id === chat.agent_id
            )
            const isActive = chat.status === 'active'
            return (
              <button
                key={chat.id}
                onClick={() => setSelectedConvId(chat.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-colors border',
                  activeConvId === chat.id
                    ? 'bg-accent/10 border-accent/20 text-accent'
                    : 'hover:bg-white/5 text-muted-foreground hover:text-foreground border-transparent'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {chatAgent && (
                    <AgentAvatar name={chatAgent.name} color={chatAgent.avatar_color} size="sm" />
                  )}
                  <span className="text-sm font-medium truncate flex-1">
                    {chat.title}
                  </span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-status-running shrink-0 led-pulse" />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] opacity-60 pl-6">
                  <span>{chatAgent?.name}</span>
                  <span className="font-mono">{timeAgo(chat.last_message_at)}</span>
                </div>
                {chat.message_count > 0 && (
                  <div className="text-[10px] opacity-40 pl-6 mt-0.5 font-mono">
                    {chat.message_count} message{chat.message_count !== 1 ? 's' : ''} · {formatCost(chat.total_cost)}
                  </div>
                )}
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
            <span className={cn(
              'ml-3 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium',
              conversationStatus === 'responding'
                ? 'text-status-running bg-status-running/10'
                : conversationStatus === 'idle'
                  ? 'text-muted-foreground bg-white/5'
                  : conversationStatus === 'ended'
                    ? 'text-status-success bg-status-success/10'
                    : 'text-muted-foreground bg-white/5'
            )}>
              {conversationStatus === 'responding' ? 'Agent responding' : conversationStatus === 'idle' ? 'Session idle' : conversationStatus === 'ended' ? 'Session ended' : conversationStatus}
            </span>
          </header>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6">
            {detailLoading && convMessages.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">Loading transcript...</span>
              </div>
            )}

            {!detailLoading && convMessages.length === 0 && (
              <div className="text-center py-16">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">
                  No messages in this session yet
                </p>
              </div>
            )}

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
                    ) : msg.role === 'tool' ? (
                      <div className="w-8 h-8 rounded-full bg-status-tool/20 text-status-tool flex items-center justify-center border border-status-tool/30">
                        <Terminal className="w-4 h-4" />
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
                      className={cn(
                        'p-4 rounded-2xl text-sm leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-accent/10 text-foreground border border-accent/20 rounded-tr-sm'
                          : msg.role === 'tool'
                            ? 'bg-[#050506] text-foreground border border-status-tool/20 rounded-tl-sm'
                            : 'bg-card text-foreground border border-border rounded-tl-sm shadow-sm'
                      )}
                      style={
                        msg.role === 'assistant'
                          ? {
                              borderLeftWidth: '3px',
                              borderLeftColor: agent.avatar_color,
                            }
                          : {}
                      }
                    >
                      {msg.content && cleanMessageContent(msg.content) && (
                        <div className="whitespace-pre-wrap">
                          {cleanMessageContent(msg.content)}
                        </div>
                      )}

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
                              {tc.input && (
                                <div>
                                  <span className="opacity-50">
                                    &gt; Input:
                                  </span>{' '}
                                  {tc.input}
                                </div>
                              )}
                              {tc.output && (
                                <div className="text-status-success/80">
                                  <span className="opacity-50">
                                    &gt; Result:
                                  </span>{' '}
                                  {tc.output}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Message Footer */}
                    {msg.role === 'assistant' && (msg.estimated_cost || msg.input_tokens || msg.output_tokens) && (
                      <div className="mt-1.5 ml-1 text-[10px] text-muted-foreground font-mono flex items-center gap-3">
                        {(msg.input_tokens || msg.output_tokens) && (
                          <span>
                            {formatTokens(
                              (msg.input_tokens || 0) +
                                (msg.output_tokens || 0)
                            )}{' '}
                            tkns
                          </span>
                        )}
                        {msg.estimated_cost != null && msg.estimated_cost > 0 && (
                          <span>
                            {formatCost(msg.estimated_cost)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Indicator — only when session is actually active */}
            {sessionInfo.isLocked && (
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

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Composer */}
          <ChatComposer
            sessionId={sessionInfo.sessionId}
            agentId={sessionInfo.agentId}
            isSessionActive={sessionInfo.isLocked}
          />
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
                <Bot className="w-4 h-4 text-accent" /> Agent
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {agent.name}
                  </span>
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    sessionInfo.isLocked ? 'bg-status-running led-pulse' : 'bg-muted-foreground/30'
                  )} />
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
                    {convMessages.length || selectedConv.message_count}
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
                  <span className={cn(
                    'font-mono',
                    conversationStatus === 'responding' ? 'text-status-running' : 'text-foreground'
                  )}>
                    {conversationStatus === 'responding' ? 'Agent responding' : conversationStatus === 'idle' ? 'Idle' : conversationStatus === 'ended' ? 'Ended' : conversationStatus}
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
                {detail.pagination.hasMore && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Transcript
                    </span>
                    <span className="font-mono text-foreground">
                      {detail.pagination.totalLinesRead} lines
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Chat Composer ---

interface ChatComposerProps {
  sessionId: string
  agentId: string | null
  isSessionActive: boolean
}

function ChatComposer({ sessionId, agentId, isSessionActive: _isActive }: ChatComposerProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [message])

  const handleSend = async () => {
    const text = message.trim()
    if (!text || sending) return

    setSending(true)
    try {
      await sendChatMessage({
        message: text,
        conversation_id: `conv-${sessionId}`,
      })
      setMessage('')
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-end gap-2 px-4 py-3">
        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Send a message to this agent..."
            className="w-full bg-[#050506] border border-border/50 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-accent/30 transition-colors"
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className={cn(
            'p-2.5 rounded-xl transition-colors',
            message.trim() && !sending
              ? 'bg-accent text-white hover:bg-accent/80'
              : 'bg-accent/20 text-accent/30 cursor-not-allowed'
          )}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
