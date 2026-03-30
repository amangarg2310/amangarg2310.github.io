'use client'

import { use, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  useConversations,
  useConversationDetail,
  useTasks,
  useActivity,
  useProjectContext,
  useAgents,
} from '@/lib/hooks'
import {
  sendChatMessage,
  updateTaskStatus,
  updateProjectObjective,
  updateProjectFocus,
} from '@/lib/api'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { timeAgo, cn } from '@/lib/utils'
import type { Task, Message } from '@/lib/types'
import {
  MessageSquare,
  LayoutGrid,
  Activity,
  Send,
  Paperclip,
  Plus,
  ArrowRight,
  ArrowLeft,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react'

type Tab = 'chat' | 'boards' | 'activity'

const TASK_STATUSES: Task['status'][] = ['queued', 'running', 'needs_approval', 'completed']
const TASK_COLUMN_LABELS: Record<string, string> = {
  queued: 'Backlog',
  running: 'In Progress',
  needs_approval: 'Review',
  completed: 'Done',
}

export default function ProjectWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = use(params)
  const sp = use(searchParams)
  const router = useRouter()

  const initialTab = (sp?.tab as Tab) || 'chat'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const { data: ctx, loading: ctxLoading } = useProjectContext(id)
  const project = ctx?.project

  // Inline editing
  const [editingObjective, setEditingObjective] = useState(false)
  const [objectiveDraft, setObjectiveDraft] = useState('')
  const [editingFocus, setEditingFocus] = useState(false)
  const [focusDraft, setFocusDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // Sync URL
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', activeTab)
    window.history.replaceState(null, '', url.toString())
  }, [activeTab])

  async function saveObjective() {
    if (!project || !objectiveDraft.trim()) {
      setEditingObjective(false)
      return
    }
    setSaving(true)
    try {
      await updateProjectObjective(id, objectiveDraft.trim())
    } finally {
      setSaving(false)
      setEditingObjective(false)
    }
  }

  async function saveFocus() {
    if (!project || !focusDraft.trim()) {
      setEditingFocus(false)
      return
    }
    setSaving(true)
    try {
      await updateProjectFocus(id, focusDraft.trim())
    } finally {
      setSaving(false)
      setEditingFocus(false)
    }
  }

  if (ctxLoading && !project) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-foreground">Project not found</p>
          <button
            onClick={() => router.push('/projects')}
            className="text-xs text-accent hover:underline"
          >
            Back to projects
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border/50 bg-[#050506]">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-3 h-3 rounded-full mt-2 shrink-0"
            style={{ backgroundColor: project.color }}
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">{project.name}</h1>

            {/* Objective */}
            <div className="mt-1">
              {editingObjective ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    className="flex-1 text-sm text-foreground bg-white/5 border border-accent/40 rounded px-2 py-1 outline-none"
                    value={objectiveDraft}
                    onChange={(e) => setObjectiveDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveObjective()
                      if (e.key === 'Escape') setEditingObjective(false)
                    }}
                    placeholder="Enter objective..."
                  />
                  <button
                    onClick={saveObjective}
                    disabled={saving}
                    className="text-xs text-accent hover:underline disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingObjective(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setObjectiveDraft(project.objective || '')
                    setEditingObjective(true)
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left group"
                >
                  {project.objective ? (
                    project.objective
                  ) : (
                    <span className="italic text-muted-foreground/50">
                      Click to set objective...
                    </span>
                  )}
                  <span className="ml-1 opacity-0 group-hover:opacity-50 text-xs text-accent">
                    edit
                  </span>
                </button>
              )}
            </div>

            {/* Focus */}
            <div className="mt-0.5">
              {editingFocus ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    className="flex-1 text-xs text-foreground bg-white/5 border border-accent/40 rounded px-2 py-1 outline-none"
                    value={focusDraft}
                    onChange={(e) => setFocusDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveFocus()
                      if (e.key === 'Escape') setEditingFocus(false)
                    }}
                    placeholder="Current focus area..."
                  />
                  <button
                    onClick={saveFocus}
                    disabled={saving}
                    className="text-xs text-accent hover:underline disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingFocus(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setFocusDraft(project.focus?.summary || '')
                    setEditingFocus(true)
                  }}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors text-left group"
                >
                  {project.focus?.summary ? (
                    <>Focus: {project.focus.summary}</>
                  ) : (
                    <span className="italic opacity-50">Click to set current focus...</span>
                  )}
                  <span className="ml-1 opacity-0 group-hover:opacity-50 text-[10px] text-accent">
                    edit
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {(
            [
              { id: 'chat' as const, label: 'Chat', Icon: MessageSquare },
              { id: 'boards' as const, label: 'Boards', Icon: LayoutGrid },
              { id: 'activity' as const, label: 'Activity', Icon: Activity },
            ] as const
          ).map(({ id: tabId, label, Icon }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                activeTab === tabId
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatTab projectId={id} />}
        {activeTab === 'boards' && <BoardsTab projectId={id} />}
        {activeTab === 'activity' && <ActivityTab projectId={id} />}
      </div>
    </div>
  )
}

// ─── Chat Tab ────────────────────────────────────────────────────────────────

function ChatTab({ projectId }: { projectId: string }) {
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingImages, setPendingImages] = useState<
    { data: string; name: string; type: string }[]
  >([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: conversations } = useConversations(projectId, 5000, conversationRefreshKey)
  const { data: agents } = useAgents()
  const { data: detail, loading: detailLoading } = useConversationDetail(
    selectedConversationId ?? '',
    3000
  )

  // Auto-select latest conversation
  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id)
    }
  }, [conversations, selectedConversationId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [detail.messages])

  async function handleSend() {
    const text = message.trim()
    if (!text && pendingImages.length === 0) return
    setSending(true)
    setMessage('')
    const imgs = pendingImages
    setPendingImages([])
    try {
      const result = await sendChatMessage({
        message: text,
        images: imgs.length > 0 ? imgs : undefined,
        conversation_id: selectedConversationId ?? undefined,
        project_id: projectId,
      })
      if (result.conversation_id && !selectedConversationId) {
        setSelectedConversationId(result.conversation_id)
      }
      setConversationRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('Send failed:', err)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const loaded = await Promise.all(
      files.map(
        (f) =>
          new Promise<{ data: string; name: string; type: string }>((resolve) => {
            const reader = new FileReader()
            reader.onload = () =>
              resolve({ data: reader.result as string, name: f.name, type: f.type })
            reader.readAsDataURL(f)
          })
      )
    )
    setPendingImages((prev) => [...prev, ...loaded])
    if (e.target) e.target.value = ''
  }

  return (
    <div className="h-full flex">
      {/* Conversations sidebar */}
      <div className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-[#050506]">
        <div className="p-3 border-b border-border/50">
          <button
            onClick={() => setSelectedConversationId(null)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/15 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {conversations.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <MessageSquare className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/50">No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const agent = agents.find((a) => a.id === conv.agent_id)
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors',
                    selectedConversationId === conv.id && 'bg-accent/5 border-r-2 border-accent'
                  )}
                >
                  <AgentAvatar
                    name={agent?.name || 'Agent'}
                    color={agent?.avatar_color || '#6366f1'}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {conv.title || 'Conversation'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      {timeAgo(conv.last_message_at)} · {conv.message_count} msg
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!selectedConversationId ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-sm">
                <MessageSquare className="w-10 h-10 text-accent/30 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-foreground">Start a conversation</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your agent will analyze your message, suggest tasks, and can spawn sub-agents
                    for complex work.
                  </p>
                </div>
              </div>
            </div>
          ) : detailLoading && detail.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : detail.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            detail.messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 p-4 border-t border-border/50">
          {pendingImages.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.data}
                    alt={img.name}
                    className="h-14 w-14 object-cover rounded border border-border"
                  />
                  <button
                    onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you need... (Enter to send, Shift+Enter for new line)"
              className="flex-1 resize-none rounded-lg bg-white/[0.03] border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/40 transition-colors"
            />
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-lg bg-white/[0.03] border border-border text-muted-foreground hover:text-foreground hover:border-accent/30 transition-all"
                title="Attach image"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                onClick={handleSend}
                disabled={sending || (!message.trim() && pendingImages.length === 0)}
                className="p-2 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'

  if (isTool) {
    return (
      <div className="flex items-start gap-2 text-xs text-muted-foreground/60">
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 mt-1.5 shrink-0" />
        <span className="font-mono break-all">
          {message.content.slice(0, 120)}
          {message.content.length > 120 ? '...' : ''}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
          <LayoutDashboard className="w-3.5 h-3.5 text-accent" />
        </div>
      )}
      <div className="max-w-[70%] space-y-1">
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1">
            {message.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.data}
                alt={img.name}
                className="h-24 rounded-lg border border-border object-cover"
              />
            ))}
          </div>
        )}
        {message.content && (
          <div
            className={cn(
              'px-3.5 py-2.5 rounded-xl text-sm whitespace-pre-wrap',
              isUser
                ? 'bg-accent text-white rounded-tr-sm'
                : 'bg-card border border-border text-foreground rounded-tl-sm'
            )}
          >
            {message.content}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/50 px-1">
          {timeAgo(message.created_at)}
          {message.estimated_cost != null && message.estimated_cost > 0 && (
            <> · Est. ${message.estimated_cost.toFixed(4)}</>
          )}
        </p>
      </div>
    </div>
  )
}

// ─── Boards Tab ───────────────────────────────────────────────────────────────

function BoardsTab({ projectId }: { projectId: string }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: tasks } = useTasks(projectId, 10000, refreshKey)

  async function moveTask(taskId: string, newStatus: Task['status']) {
    await updateTaskStatus(taskId, newStatus)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/15 text-xs text-muted-foreground">
        <CheckCircle2 className="w-3.5 h-3.5 text-accent/60 shrink-0 mt-0.5" />
        <span>
          Tasks are created by your agent during conversations. Chat with your agent to generate
          work items.
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {TASK_STATUSES.map((colStatus, colIndex) => {
          const colTasks = tasks.filter((t) => t.status === colStatus)
          return (
            <div key={colStatus} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {TASK_COLUMN_LABELS[colStatus]}
                </span>
                <span className="text-[10px] bg-white/5 text-muted-foreground/60 rounded-full px-1.5 py-0.5">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[120px]">
                {colTasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/40 p-4 text-center">
                    <p className="text-xs text-muted-foreground/40">No tasks</p>
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onMoveLeft={
                        colIndex > 0
                          ? () => moveTask(task.id, TASK_STATUSES[colIndex - 1])
                          : undefined
                      }
                      onMoveRight={
                        colIndex < TASK_STATUSES.length - 1
                          ? () => moveTask(task.id, TASK_STATUSES[colIndex + 1])
                          : undefined
                      }
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  onMoveLeft,
  onMoveRight,
}: {
  task: Task
  onMoveLeft?: () => void
  onMoveRight?: () => void
}) {
  const priorityColors: Record<string, string> = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-muted-foreground',
  }

  return (
    <div className="rounded-lg bg-card border border-border p-3 group hover:border-accent/30 transition-colors">
      <p className="text-xs font-medium text-foreground mb-1 leading-snug">{task.title}</p>
      {task.description && (
        <p className="text-[10px] text-muted-foreground/60 mb-2 line-clamp-2">
          {task.description}
        </p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[10px] font-medium',
              priorityColors[task.priority] || 'text-muted-foreground'
            )}
          >
            {task.priority}
          </span>
          {task.role && (
            <span className="text-[10px] text-muted-foreground/50 capitalize">{task.role}</span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onMoveLeft && (
            <button
              onClick={onMoveLeft}
              title="Move left"
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {onMoveRight && (
            <button
              onClick={onMoveRight}
              title="Move right"
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab({ projectId }: { projectId: string }) {
  const { data: activities } = useActivity(30, projectId)

  const typeColors: Record<string, string> = {
    run_started: 'bg-status-running',
    run_completed: 'bg-status-success',
    run_failed: 'bg-status-failed',
    task_created: 'bg-accent',
    task_updated: 'bg-yellow-500',
    message_sent: 'bg-blue-500',
    agent_online: 'bg-green-500',
    agent_offline: 'bg-muted-foreground',
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-3">
          <Activity className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/50">No activity yet</p>
          <p className="text-xs text-muted-foreground/30">
            Activity appears as agents work on tasks in this project.
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-w-2xl">
          {activities.map((item) => (
            <div key={item.id} className="flex items-start gap-3 py-2">
              <div className="shrink-0 flex items-center justify-center w-5 h-5 mt-0.5">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    typeColors[item.type] || 'bg-muted-foreground/40'
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-snug">{item.text}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {timeAgo(item.time)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
