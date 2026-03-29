'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useConversations, useAgents, useConversationDetail, useProjects, useTasks } from '@/lib/hooks'
import { sendChatMessage } from '@/lib/api'
import { useActiveProject } from '@/lib/project-context'
import { Agent } from '@/lib/types'
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
  Plus,
  ImagePlus,
  X,
  CheckSquare,
  FolderKanban,
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

const CHAT_POLL_INTERVAL = 5_000 // 5 seconds

export default function ChatsPage() {
  const { activeProjectId, setActiveProjectId } = useActiveProject()
  const { data: projects } = useProjects()
  const { data: allTasks } = useTasks(undefined)

  // If no project is selected, show project selection screen
  if (!activeProjectId) {
    return <ProjectSelectionScreen projects={projects} allTasks={allTasks} onSelect={setActiveProjectId} icon="chat" />
  }

  return <ChatsPageInner />
}

function ChatsPageInner() {
  const { activeProjectId } = useActiveProject()
  const { data: projects } = useProjects()
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: conversations } = useConversations(activeProjectId, CHAT_POLL_INTERVAL, refreshKey)
  const { data: agents } = useAgents()
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)

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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-foreground">Conversations</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {conversations.length} session{conversations.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => { setShowNewChat(true); setSelectedConvId(null) }}
              className="p-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {conversations.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <MessageSquare className="w-6 h-6 text-muted-foreground/30 mx-auto" />
              <p className="text-xs text-muted-foreground/50">
                Start your first conversation
              </p>
              <p className="text-[10px] text-muted-foreground/30 leading-relaxed px-2">
                This works just like Claude Code — ask questions, discuss ideas, share screenshots, and Claude will identify tasks as they come up.
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
                onClick={() => { setSelectedConvId(chat.id); setShowNewChat(false) }}
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
                  <span className="text-sm font-medium flex-1 line-clamp-2 leading-snug">
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
      {selectedConv && agent && !showNewChat ? (
        <div className="flex-1 flex flex-col relative">
          {/* Header */}
          <header className="h-14 border-b border-border flex items-center px-6 bg-card/30 backdrop-blur-sm z-10">
            {activeProject && (
              <span className="flex items-center gap-1.5 mr-3 text-xs text-muted-foreground bg-white/5 border border-border/50 px-2 py-1 rounded-md">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: activeProject.color }}
                />
                {activeProject.name}
              </span>
            )}
            <h2 className="text-sm font-medium text-foreground">
              {selectedConv.title}
            </h2>
            {/* Model badge — derived from last assistant message */}
            {(() => {
              const lastModel = [...convMessages].reverse().find(m => m.role === 'assistant' && m.model)?.model
              return lastModel ? (
                <span className="ml-3 text-[11px] font-mono text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-md">
                  {lastModel}
                </span>
              ) : null
            })()}
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
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-table:my-2 prose-hr:my-3 prose-a:text-accent prose-strong:text-foreground">
                          <ReactMarkdown>{cleanMessageContent(msg.content)}</ReactMarkdown>
                        </div>
                      )}

                      {/* Attached images */}
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-2">
                          {msg.images.map((img) => (
                            <a key={img.id} href={img.data} target="_blank" rel="noopener noreferrer">
                              <img
                                src={img.data}
                                alt={img.name}
                                className="max-h-48 w-auto rounded-lg border border-border/50 cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ))}
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
                    {msg.role === 'assistant' && ((msg.estimated_cost != null && msg.estimated_cost > 0) || (msg.input_tokens != null && msg.input_tokens > 0) || (msg.output_tokens != null && msg.output_tokens > 0)) && (
                      <div className="mt-1.5 ml-1 text-[10px] text-muted-foreground font-mono flex items-center gap-3">
                        {((msg.input_tokens ?? 0) + (msg.output_tokens ?? 0)) > 0 && (
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
          <NewChatComposer
            projectId={activeProjectId}
            agents={agents}
            onCreated={(convId) => {
              setSelectedConvId(convId)
              setShowNewChat(false)
              setRefreshKey((k) => k + 1)
            }}
          />
        </div>
      )}

      {/* Right Panel: Metadata Sidebar */}
      {selectedConv && agent && !showNewChat && (
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

            {/* Tasks identified during this conversation */}
            {(() => {
              const taskPattern = /\[TASK:\s*title="([^"]+)"/g
              const tasks: string[] = []
              convMessages.forEach(m => {
                if (m.role !== 'assistant') return
                let match
                while ((match = taskPattern.exec(m.content)) !== null) {
                  tasks.push(match[1])
                }
              })
              if (tasks.length === 0) return null
              return (
                <div className="bg-card border border-border rounded-xl p-3 card-glow">
                  <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
                    <CheckSquare className="w-4 h-4 text-status-success" /> Tasks Created
                  </div>
                  <div className="space-y-1.5">
                    {tasks.map((title, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-status-success mt-0.5 shrink-0">+</span>
                        <span>{title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
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

function ChatComposer({ sessionId, isSessionActive: _isActive }: ChatComposerProps) {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<{ data: string; name: string; type: string }[]>([])
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [message])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        setImages((prev) => [...prev, { data: reader.result as string, name: file.name, type: file.type }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    const text = message.trim()
    if ((!text && images.length === 0) || sending) return

    setSending(true)
    try {
      await sendChatMessage({
        message: text || '(see attached image)',
        images: images.length > 0 ? images : undefined,
        conversation_id: `conv-${sessionId}`,
      })
      setMessage('')
      setImages([])
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

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          setImages((prev) => [...prev, { data: reader.result as string, name: `paste-${Date.now()}.png`, type: file.type }])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const canSend = (message.trim() || images.length > 0) && !sending

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img src={img.data} alt={img.name} className="h-16 w-auto rounded-lg border border-border object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 px-4 py-3">
        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="Attach image or screenshot"
        >
          <ImagePlus className="w-4 h-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            placeholder="Send a message to this agent..."
            className="w-full bg-[#050506] border border-border/50 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-accent/30 transition-colors"
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'p-2.5 rounded-xl transition-colors',
            canSend
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

// --- New Chat Composer ---

function NewChatComposer({
  projectId,
  agents,
  onCreated,
}: {
  projectId: string | null
  agents: Agent[]
  onCreated: (conversationId: string) => void
}) {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<{ data: string; name: string; type: string }[]>([])
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const defaultAgent = agents.find(a => a.id === 'agent-default') || agents[0]
  const effectiveProjectId = projectId || 'proj-default'

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [message])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        setImages((prev) => [...prev, { data: reader.result as string, name: file.name, type: file.type }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          setImages((prev) => [...prev, { data: reader.result as string, name: `paste-${Date.now()}.png`, type: file.type }])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleSend = async () => {
    const text = message.trim()
    if ((!text && images.length === 0) || sending || !defaultAgent) return

    setSending(true)
    try {
      const res = await sendChatMessage({
        message: text || '(see attached image)',
        images: images.length > 0 ? images : undefined,
        project_id: effectiveProjectId,
        agent_id: defaultAgent.id,
      })
      if (res.conversation_id) {
        onCreated(res.conversation_id)
      }
      setMessage('')
      setImages([])
    } catch (err) {
      console.error('Failed to start chat:', err)
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

  const canSend = (message.trim() || images.length > 0) && !sending && !!defaultAgent

  return (
    <div className="w-full max-w-2xl px-8 space-y-6">
      <div className="text-center space-y-2">
        <MessageSquare className="w-10 h-10 text-accent mx-auto opacity-60" />
        <h2 className="text-lg font-semibold text-foreground">New Conversation</h2>
        <p className="text-sm text-muted-foreground">
          Start a conversation with Claude about any project. Share screenshots, discuss ideas, and Claude will identify tasks as they come up.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {defaultAgent && (
            <>
              <AgentAvatar name={defaultAgent.name} color={defaultAgent.avatar_color} size="sm" />
              <span>{defaultAgent.name}</span>
            </>
          )}
        </div>

        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img.data} alt={img.name} className="h-20 w-auto rounded-lg border border-border object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={3}
          placeholder="Ask a question, discuss ideas, or share a screenshot..."
          className="w-full bg-background border border-border/50 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-accent/30 transition-colors"
          autoFocus
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Attach image or screenshot"
            >
              <ImagePlus className="w-4 h-4" />
              <span>Add image</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
            <span className="text-[10px] text-muted-foreground/50">
              Paste screenshots with Cmd+V
            </span>
          </div>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              canSend
                ? 'bg-accent text-white hover:bg-accent/80'
                : 'bg-accent/20 text-accent/30 cursor-not-allowed'
            )}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Project Selection Screen ---

import type { Project, Task } from '@/lib/types'

function ProjectSelectionScreen({
  projects,
  allTasks,
  onSelect,
  icon,
}: {
  projects: Project[]
  allTasks: Task[]
  onSelect: (id: string) => void
  icon: 'chat' | 'board'
}) {
  const taskCountByProject = (projectId: string) =>
    allTasks.filter((t) => t.project_id === projectId).length

  return (
    <div className="flex-1 h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-2xl px-8 space-y-8">
        <div className="text-center space-y-3">
          {icon === 'chat' ? (
            <MessageSquare className="w-12 h-12 text-accent mx-auto opacity-50" />
          ) : (
            <FolderKanban className="w-12 h-12 text-accent mx-auto opacity-50" />
          )}
          <h2 className="text-xl font-semibold text-foreground">
            {icon === 'chat' ? 'Select a project to start chatting' : 'Select a project to view its board'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {icon === 'chat'
              ? 'Choose a project below to open its chat workspace. Conversations are scoped to the selected project.'
              : 'Choose a project below to view its task board. Each project has its own Kanban board.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((project) => {
            const taskCount = taskCountByProject(project.id)
            return (
              <button
                key={project.id}
                onClick={() => onSelect(project.id)}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-accent/30 hover:bg-accent/5 transition-all text-left group"
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: project.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                    {project.name}
                  </div>
                  {project.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="text-[10px] text-muted-foreground/60 mt-1.5 font-mono">
                    {taskCount} task{taskCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {projects.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <FolderKanban className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">
              No projects yet. Create one from the Projects page to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
