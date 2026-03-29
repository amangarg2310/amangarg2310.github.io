/**
 * Agent Runtime: spawns and manages Claude agents via the Agent SDK.
 *
 * Uses @anthropic-ai/claude-code's query() function which:
 * - Spawns Claude Code subprocesses
 * - Inherits the user's existing Claude Code login (no API key needed)
 * - Provides full tool access (Read, Write, Bash, Grep, etc.)
 * - Supports multi-agent via subagent definitions
 *
 * Server-only — never import from client components.
 */

import type { Run, Message, Conversation, RoleLane } from './types'
import { store } from './store'
import crypto from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queryFn: any = null
async function getQuery() {
  if (!queryFn) {
    try {
      // Hide the module path from Turbopack's static analysis completely
      const modName = ['@anthropic-ai', 'claude-code'].join('/')
      // eslint-disable-next-line no-eval
      const sdk = await eval(`import('${modName}')`)
      queryFn = sdk.query || sdk.default?.query
      if (!queryFn) throw new Error('SDK loaded but query function not found')
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('query function not found')) throw err
      throw new Error(
        `Claude Code SDK error: ${msg}. Ensure it is installed: npm install @anthropic-ai/claude-code`
      )
    }
  }
  return queryFn
}

/** Active agent sessions keyed by conversation ID */
const activeSessions = new Map<string, {
  abortController: AbortController
  agentId: string
  projectId: string
  runId?: string
}>()

/** Role-based system prompts for each lane */
const ROLE_PROMPTS: Record<RoleLane, string> = {
  research: `You are a Research Analyst. Your job is to gather data, analyze trends, monitor competitors, and surface insights. Be thorough and cite sources. Focus on actionable intelligence.`,
  strategy: `You are a Strategy Lead. Your job is to synthesize research into strategic recommendations, identify opportunities, evaluate tradeoffs, and draft strategic memos. Be decisive and data-driven.`,
  product: `You are a Product & PMM Lead. Your job is to define product positioning, packaging, feature priorities, and go-to-market messaging. Think about the user journey and competitive differentiation.`,
  content: `You are a Content & Marketing Lead. Your job is to plan content calendars, write copy, develop brand voice, and recommend distribution channels. Be creative but metrics-aware.`,
  performance_marketing: `You are a Performance Marketing Lead. Your job is to optimize ad campaigns, analyze ROAS, recommend budget allocation, and track conversion metrics. Be quantitative and ROI-focused.`,
  consumer_insights: `You are a Consumer Insights Lead. Your job is to analyze reviews, sentiment, user feedback, and behavioral patterns. Surface the voice of the customer.`,
  advisor: `You are a Strategic Advisor. Your job is to provide founder-level guidance, synthesize across all workstreams, identify blind spots, and recommend priorities. Be candid and actionable.`,
}

const TASK_CREATION_PROMPT = `

When you identify specific actionable work items during our conversation, create tasks by outputting them in this exact format on their own line:

[TASK: title="Brief task title" priority="high|medium|low" description="What needs to be done"]

Only create tasks for concrete, actionable items — not for every topic discussed. Tasks should represent work that needs to be tracked and executed. The user will decide when to prioritize and start working on them.`

/** Map model tier to SDK model param */
function resolveModel(tier?: string): 'sonnet' | 'opus' | 'haiku' {
  switch (tier) {
    case 'premium': return 'opus'
    case 'economy': return 'haiku'
    default: return 'sonnet'
  }
}

/** Helper to create a Message object matching the types.ts contract */
function makeMessage(fields: {
  conversation_id: string
  role: Message['role']
  content: string
  agent_id?: string | null
  model?: string | null
  input_tokens?: number | null
  output_tokens?: number | null
  estimated_cost?: number | null
  tool_calls?: Message['tool_calls']
}): Message {
  return {
    id: `msg-${crypto.randomUUID().slice(0, 8)}`,
    conversation_id: fields.conversation_id,
    role: fields.role,
    content: fields.content,
    agent_id: fields.agent_id ?? null,
    model: fields.model ?? null,
    input_tokens: fields.input_tokens ?? null,
    output_tokens: fields.output_tokens ?? null,
    estimated_cost: fields.estimated_cost ?? null,
    tool_calls: fields.tool_calls,
    created_at: new Date().toISOString(),
  }
}

/**
 * Parse [TASK: ...] markers from agent responses and create tasks in the store.
 */
function extractAndCreateTasks(content: string, projectId: string, agentId: string): void {
  const taskPattern = /\[TASK:\s*title="([^"]+)"\s*priority="([^"]+)"\s*description="([^"]+)"\]/g
  let match
  while ((match = taskPattern.exec(content)) !== null) {
    const [, title, priority, description] = match
    const taskId = `task-${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    store.upsertTask({
      id: taskId,
      title,
      description,
      priority: (priority as 'high' | 'medium' | 'low') || 'medium',
      status: 'queued', // Always starts in Backlog
      assigned_agent_id: agentId,
      created_by: 'agent',
      project_id: projectId,
      created_at: now,
      updated_at: now,
    })
    console.log(`[agent-runtime] Agent created task: "${title}" (${taskId})`)
  }
}

/**
 * Start a new conversation with Claude. This is the primary chat interface.
 * Does NOT create any tasks — Claude will identify tasks during conversation.
 */
export function startConversation(opts: {
  conversationId: string
  agentId: string
  projectId: string
  prompt: string
  role?: RoleLane
  model?: string
  cwd?: string
}): void {
  // Run the agent in the background
  _runConversation(opts).catch((err) => {
    console.error(`[agent-runtime] Conversation ${opts.conversationId} error:`, err)
    // Add error as assistant message so the user sees it in chat
    store.addMessage(makeMessage({
      conversation_id: opts.conversationId,
      role: 'assistant',
      content: `Error: ${(err as Error).message}`,
      agent_id: opts.agentId,
    }))
    // Update conversation status
    const conv = store.getConversation(opts.conversationId)
    if (conv) {
      conv.status = 'completed'
      conv.message_count = store.getMessages(opts.conversationId).length
      conv.last_message_at = new Date().toISOString()
      store.upsertConversation(conv)
    }
  })
}

/**
 * Internal: run a conversation turn via the SDK.
 */
async function _runConversation(opts: {
  conversationId: string
  agentId: string
  projectId: string
  prompt: string
  role?: RoleLane
  model?: string
  cwd?: string
}): Promise<void> {
  const query = await getQuery()
  const abortController = new AbortController()

  activeSessions.set(opts.conversationId, {
    abortController,
    agentId: opts.agentId,
    projectId: opts.projectId,
  })

  const agent = store.getAgent(opts.agentId)
  const rolePrompt = opts.role ? ROLE_PROMPTS[opts.role] : ''
  const basePrompt = rolePrompt || agent?.system_prompt || 'You are a helpful AI assistant working on startup projects.'
  const systemPrompt = `${basePrompt}

You are part of Mission Control — a founder's operating system for managing multiple startup projects. The founder is chatting with you directly, like they would in Claude Code.

Be conversational, helpful, and actionable. This is a real working conversation, not a task queue.${TASK_CREATION_PROMPT}`

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let assistantContent = ''

  try {
    const result = query({
      prompt: opts.prompt,
      options: {
        systemPrompt,
        model: resolveModel(opts.model),
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
        permissionMode: 'default',
        cwd: opts.cwd || process.cwd(),
        maxTurns: 25,
        abortController,
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const message of result as AsyncIterable<any>) {
      if (message.type === 'assistant') {
        const textBlocks = (message.message?.content || []).filter(
          (b: Record<string, unknown>) => 'text' in b
        )
        const text = textBlocks.map((b: Record<string, unknown>) => b.text as string).join('\n')

        if (text) {
          assistantContent += text + '\n'
        }

        // Track tool calls
        const toolBlocks = (message.message?.content || []).filter(
          (b: Record<string, unknown>) => 'name' in b
        )
        for (const tool of toolBlocks) {
          store.addMessage(makeMessage({
            conversation_id: opts.conversationId,
            role: 'tool',
            content: `Tool: ${tool.name}`,
            agent_id: opts.agentId,
            tool_calls: [{
              id: `tc-${crypto.randomUUID().slice(0, 8)}`,
              name: tool.name as string,
              input: JSON.stringify(tool.input || '').slice(0, 500),
              output: '',
              duration_ms: 0,
            }],
          }))
        }
      }

      if (message.type === 'result') {
        totalInputTokens += message.input_tokens || 0
        totalOutputTokens += message.output_tokens || 0

        if (assistantContent.trim()) {
          // Extract any tasks the agent identified
          extractAndCreateTasks(assistantContent, opts.projectId, opts.agentId)

          store.addMessage(makeMessage({
            conversation_id: opts.conversationId,
            role: 'assistant',
            content: assistantContent.trim(),
            agent_id: opts.agentId,
            model: opts.model || 'anthropic/claude-sonnet-4-6',
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            estimated_cost: estimateCost(totalInputTokens, totalOutputTokens),
          }))
        }
      }
    }

    // Update conversation
    const conv = store.getConversation(opts.conversationId)
    if (conv) {
      conv.status = 'active' // Keep active for follow-ups (not 'completed')
      conv.total_cost += estimateCost(totalInputTokens, totalOutputTokens)
      conv.message_count = store.getMessages(opts.conversationId).length
      conv.last_message_at = new Date().toISOString()
      store.upsertConversation(conv)
    }
  } catch (err) {
    // Add error message to conversation
    store.addMessage(makeMessage({
      conversation_id: opts.conversationId,
      role: 'assistant',
      content: `Error: ${(err as Error).message}`,
      agent_id: opts.agentId,
    }))
    throw err
  } finally {
    activeSessions.delete(opts.conversationId)
  }
}

/**
 * Send a follow-up message in an existing conversation.
 * Stores the message and starts a new agent turn.
 * Does NOT create tasks — the agent decides when to create tasks.
 */
export async function sendMessage(conversationId: string, content: string, images?: import('./types').MessageImage[]): Promise<void> {
  // Add user message to store (with images if any)
  const msg = makeMessage({
    conversation_id: conversationId,
    role: 'user',
    content,
  })
  if (images?.length) {
    msg.images = images
  }
  store.addMessage(msg)

  // Update conversation
  const conv = store.getConversation(conversationId)
  if (conv) {
    conv.message_count = store.getMessages(conversationId).length
    conv.last_message_at = new Date().toISOString()
    store.upsertConversation(conv)
  }

  // Start a new agent turn for this conversation
  const conversation = store.getConversation(conversationId)
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`)

  const agent = store.getAgent(conversation.agent_id)

  startConversation({
    conversationId,
    agentId: conversation.agent_id,
    projectId: conversation.project_id || '',
    prompt: content,
    model: agent?.default_model,
  })
}

/**
 * Spawn a task-oriented agent run (for explicit task execution from boards).
 * This is separate from conversational chat.
 */
export async function spawnAgentRun(opts: {
  taskId: string
  agentId: string
  projectId: string
  prompt: string
  role?: RoleLane
  model?: string
  cwd?: string
}): Promise<{ runId: string; conversationId: string }> {
  const runId = `run-${crypto.randomUUID().slice(0, 8)}`
  const conversationId = `conv-${crypto.randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()

  const agent = store.getAgent(opts.agentId)
  const task = store.getTask(opts.taskId)

  // Create the run record
  const run: Run = {
    id: runId,
    task_id: opts.taskId,
    agent_id: opts.agentId,
    status: 'running',
    actual_model_used: opts.model || agent?.default_model || 'anthropic/claude-sonnet-4-6',
    started_at: now,
    ended_at: null,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost: 0,
    retry_count: 0,
    parent_run_id: null,
    project_id: opts.projectId,
    agent_name: agent?.name || 'Agent',
    task_title: task?.title || opts.prompt.slice(0, 100),
  }
  store.upsertRun(run)

  // Create conversation for the run
  store.upsertConversation({
    id: conversationId,
    agent_id: opts.agentId,
    title: task?.title || opts.prompt.slice(0, 80),
    task_id: opts.taskId,
    status: 'active',
    message_count: 1,
    total_cost: 0,
    last_message_at: now,
    project_id: opts.projectId,
  })

  // Add user's prompt
  store.addMessage(makeMessage({
    conversation_id: conversationId,
    role: 'user',
    content: opts.prompt,
  }))

  // Update task status
  if (task) {
    store.updateTaskStatus(opts.taskId, 'running')
  }

  // Start agent in background
  _runConversation({
    conversationId,
    agentId: opts.agentId,
    projectId: opts.projectId,
    prompt: opts.prompt,
    role: opts.role,
    model: opts.model,
    cwd: opts.cwd,
  }).then(() => {
    // Mark run completed
    const r = store.getRun(runId)
    if (r) {
      r.status = 'completed'
      r.ended_at = new Date().toISOString()
      store.upsertRun(r)
    }
    if (task) store.updateTaskStatus(opts.taskId, 'completed')
  }).catch((err) => {
    console.error(`[agent-runtime] Run ${runId} crashed:`, err)
    const r = store.getRun(runId)
    if (r) {
      r.status = 'failed'
      r.ended_at = new Date().toISOString()
      store.upsertRun(r)
    }
  })

  return { runId, conversationId }
}

/**
 * Stop an active conversation or run.
 */
export function stopRun(runId: string): boolean {
  // Try by run ID first (legacy), then by conversation ID
  const session = activeSessions.get(runId)
  if (session) {
    session.abortController.abort()
    activeSessions.delete(runId)
    return true
  }
  return false
}

/**
 * Check if a conversation has an active agent session.
 */
export function isSessionActive(conversationId: string): boolean {
  return activeSessions.has(conversationId)
}

/**
 * Get all active session IDs (conversation IDs).
 */
export function getActiveRunIds(): string[] {
  return [...activeSessions.keys()]
}

/** Rough cost estimation based on Claude Sonnet pricing */
function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000
}
