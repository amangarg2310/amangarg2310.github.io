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
    const sdk = await import('@anthropic-ai/claude-code')
    queryFn = sdk.query
  }
  return queryFn
}

/** Active agent sessions keyed by run ID */
const activeSessions = new Map<string, {
  abortController: AbortController
  conversationId: string
  agentId: string
  projectId: string
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
 * Spawn a new agent run. Creates the run + conversation in the store,
 * then starts the SDK query in the background.
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

  // Create conversation record
  const conversation: Conversation = {
    id: conversationId,
    agent_id: opts.agentId,
    title: task?.title || opts.prompt.slice(0, 80),
    task_id: null,
    status: 'active',
    message_count: 1,
    total_cost: 0,
    last_message_at: now,
    project_id: opts.projectId,
  }
  store.upsertConversation(conversation)

  // Add the user's initial message
  store.addMessage(makeMessage({
    conversation_id: conversationId,
    role: 'user',
    content: opts.prompt,
  }))

  // Update task status
  if (task) {
    store.updateTaskStatus(opts.taskId, 'running')
  }

  // Start the agent in the background
  _runAgent(runId, conversationId, opts).catch((err) => {
    console.error(`[agent-runtime] Run ${runId} crashed:`, err)
    const failedRun = store.getRun(runId)
    if (failedRun) {
      failedRun.status = 'failed'
      failedRun.ended_at = new Date().toISOString()
      store.upsertRun(failedRun)
    }
  })

  return { runId, conversationId }
}

/**
 * Internal: execute the agent via the SDK.
 */
async function _runAgent(
  runId: string,
  conversationId: string,
  opts: {
    agentId: string
    projectId: string
    prompt: string
    role?: RoleLane
    model?: string
    cwd?: string
  }
): Promise<void> {
  const query = await getQuery()
  const abortController = new AbortController()

  activeSessions.set(runId, {
    abortController,
    conversationId,
    agentId: opts.agentId,
    projectId: opts.projectId,
  })

  const agent = store.getAgent(opts.agentId)
  const systemPrompt = opts.role
    ? `${ROLE_PROMPTS[opts.role]}\n\nProject context: You are working on behalf of the founder. Be concise and actionable.`
    : agent?.system_prompt || 'You are a helpful AI assistant working on a startup project.'

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
            conversation_id: conversationId,
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
          store.addMessage(makeMessage({
            conversation_id: conversationId,
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

    // Mark run as completed
    const run = store.getRun(runId)
    if (run) {
      run.status = 'completed'
      run.ended_at = new Date().toISOString()
      run.input_tokens = totalInputTokens
      run.output_tokens = totalOutputTokens
      run.estimated_cost = estimateCost(totalInputTokens, totalOutputTokens)
      store.upsertRun(run)
    }

    // Update conversation
    const conv = store.getConversation(conversationId)
    if (conv) {
      conv.status = 'completed'
      conv.total_cost = estimateCost(totalInputTokens, totalOutputTokens)
      conv.message_count = store.getMessages(conversationId).length
      conv.last_message_at = new Date().toISOString()
      store.upsertConversation(conv)
    }

    // Update task status
    const task = store.getTask(store.getRun(runId)?.task_id || '')
    if (task) {
      store.updateTaskStatus(task.id, 'completed')
    }
  } catch (err) {
    const run = store.getRun(runId)
    if (run) {
      run.status = 'failed'
      run.ended_at = new Date().toISOString()
      run.input_tokens = totalInputTokens
      run.output_tokens = totalOutputTokens
      run.estimated_cost = estimateCost(totalInputTokens, totalOutputTokens)
      store.upsertRun(run)
    }

    // Add error message to conversation
    store.addMessage(makeMessage({
      conversation_id: conversationId,
      role: 'assistant',
      content: `Error: ${(err as Error).message}`,
      agent_id: opts.agentId,
    }))

    throw err
  } finally {
    activeSessions.delete(runId)
  }
}

/**
 * Send a follow-up message to an active agent session.
 */
export async function sendMessage(conversationId: string, content: string): Promise<void> {
  // Add user message to store regardless
  store.addMessage(makeMessage({
    conversation_id: conversationId,
    role: 'user',
    content,
  }))

  // Update conversation
  const conv = store.getConversation(conversationId)
  if (conv) {
    conv.message_count = store.getMessages(conversationId).length
    conv.last_message_at = new Date().toISOString()
    store.upsertConversation(conv)
  }

  // Find the active session for this conversation
  const session = [...activeSessions.values()].find(s => s.conversationId === conversationId)

  if (!session) {
    // No active session — start a new run for this conversation
    const conversation = store.getConversation(conversationId)
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`)

    const agent = store.getAgent(conversation.agent_id)
    const projectId = conversation.project_id || ''

    // Create a task for this message
    const taskId = `task-${crypto.randomUUID().slice(0, 8)}`
    store.upsertTask({
      id: taskId,
      title: content.slice(0, 100),
      description: content,
      priority: 'medium',
      status: 'queued',
      assigned_agent_id: conversation.agent_id,
      created_by: 'user',
      project_id: projectId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    await spawnAgentRun({
      taskId,
      agentId: conversation.agent_id,
      projectId,
      prompt: content,
      model: agent?.default_model,
    })
  }
}

/**
 * Stop an active agent run.
 */
export function stopRun(runId: string): boolean {
  const session = activeSessions.get(runId)
  if (!session) return false
  session.abortController.abort()
  return true
}

/**
 * Check if an agent session is currently active.
 */
export function isSessionActive(conversationId: string): boolean {
  return [...activeSessions.values()].some(s => s.conversationId === conversationId)
}

/**
 * Get all active run IDs.
 */
export function getActiveRunIds(): string[] {
  return [...activeSessions.keys()]
}

/** Rough cost estimation based on Claude Sonnet pricing */
function estimateCost(inputTokens: number, outputTokens: number): number {
  // Sonnet: $3/M input, $15/M output (approximate)
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000
}
