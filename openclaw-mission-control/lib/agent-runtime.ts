/**
 * Agent Runtime: spawns and manages Claude agents via the Agent SDK.
 *
 * Core capabilities:
 * - Conversational chat (like Claude Code)
 * - Project-aware context (agent knows project name, objective, prior findings)
 * - Task extraction from conversations ([TASK:] markers)
 * - Sub-agent delegation ([DELEGATE:] markers)
 * - Inter-agent context sharing (agents see each other's findings)
 *
 * Server-only — never import from client components.
 */

import type { Run, Message, Conversation, RoleLane, Task } from './types'
import { store } from './store'
import crypto from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queryFn: any = null
async function getQuery() {
  if (!queryFn) {
    try {
      const modName = ['@anthropic-ai', 'claude-agent-sdk'].join('/')
      // eslint-disable-next-line no-eval
      const sdk = await eval(`import('${modName}')`)
      queryFn = sdk.query || sdk.default?.query
      if (!queryFn) throw new Error('SDK loaded but query function not found')
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('query function not found')) throw err
      throw new Error(
        `Claude Agent SDK error: ${msg}. Install it: npm install @anthropic-ai/claude-agent-sdk`
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

/** Map model tier to SDK model param */
function resolveModel(tier?: string): 'sonnet' | 'opus' | 'haiku' {
  switch (tier) {
    case 'premium': return 'opus'
    case 'economy': return 'haiku'
    default: return 'sonnet'
  }
}

/** Helper to create a Message object */
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

// ---------------------------------------------------------------------------
// PROJECT CONTEXT BUILDER
// ---------------------------------------------------------------------------

/**
 * Build rich project context for the agent's system prompt.
 * Includes project name, objective, focus, recent tasks, and findings from other agents.
 */
function buildProjectContext(projectId: string): string {
  const project = store.getProject(projectId)
  if (!project) return ''

  const parts: string[] = []

  parts.push(`\n\n## Project Context`)
  parts.push(`Project: ${project.name}`)
  if (project.objective) parts.push(`Objective: ${project.objective}`)
  if (project.focus?.summary) parts.push(`Current Focus: ${project.focus.summary}`)

  // Show existing tasks so agent doesn't duplicate
  const tasks = store.getTasksByProject(projectId)
  if (tasks.length > 0) {
    const taskList = tasks.slice(0, 15).map(t =>
      `- [${t.status}] ${t.title}${t.assigned_agent_id ? ` (assigned to ${store.getAgent(t.assigned_agent_id)?.name || 'agent'})` : ''}`
    ).join('\n')
    parts.push(`\nExisting Tasks (don't duplicate these):\n${taskList}`)
  }

  // Show recent findings from other agents on this project (inter-agent sharing)
  const conversations = store.getConversationsByProject(projectId)
  if (conversations.length > 0) {
    const findings: string[] = []
    for (const conv of conversations.slice(-5)) { // Last 5 conversations
      const messages = store.getMessages(conv.id)
      const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.content)
      if (assistantMsgs.length > 0) {
        const lastMsg = assistantMsgs[assistantMsgs.length - 1]
        const agentName = lastMsg.agent_id ? store.getAgent(lastMsg.agent_id)?.name : 'Agent'
        // Take first 300 chars of the last assistant message as a summary
        const summary = lastMsg.content.slice(0, 300).replace(/\n+/g, ' ')
        findings.push(`- ${agentName} (${conv.title}): ${summary}${lastMsg.content.length > 300 ? '...' : ''}`)
      }
    }
    if (findings.length > 0) {
      parts.push(`\nRecent Agent Findings on this project:\n${findings.join('\n')}`)
    }
  }

  // Show role assignments so agent knows who else is on the team
  const roles = store.getRoleAssignments(projectId)
  if (roles.length > 0) {
    const roleList = roles.map(r => {
      const agent = store.getAgent(r.agent_id)
      return `- ${r.role}: ${agent?.name || 'unassigned'}`
    }).join('\n')
    parts.push(`\nProject Team:\n${roleList}`)
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// TASK & DELEGATION EXTRACTION
// ---------------------------------------------------------------------------

/**
 * Parse [TASK:] markers from agent responses. Handles flexible formatting.
 */
function extractAndCreateTasks(content: string, projectId: string, agentId: string): Task[] {
  const created: Task[] = []

  // Flexible pattern: handles double or single quotes, optional spacing
  const taskPattern = /\[TASK:\s*title\s*=\s*["']([^"']+)["']\s*priority\s*=\s*["']([^"']+)["']\s*description\s*=\s*["']([^"']+)["']\s*\]/gi
  let match
  while ((match = taskPattern.exec(content)) !== null) {
    const [, title, priority, description] = match
    const taskId = `task-${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    const task: Task = {
      id: taskId,
      title,
      description,
      priority: (['critical', 'high', 'medium', 'low'].includes(priority) ? priority : 'medium') as Task['priority'],
      status: 'queued',
      assigned_agent_id: agentId,
      created_by: 'agent',
      project_id: projectId,
      created_at: now,
      updated_at: now,
    }
    store.upsertTask(task)
    created.push(task)
    console.log(`[agent-runtime] Task created: "${title}" (${taskId})`)
  }
  return created
}

/**
 * Parse [DELEGATE:] markers from agent responses and spawn sub-agent runs.
 * Format: [DELEGATE: role="research" goal="Analyze competitor pricing" priority="high"]
 */
function extractAndDelegate(content: string, projectId: string, parentAgentId: string): void {
  const delegatePattern = /\[DELEGATE:\s*role\s*=\s*["']([^"']+)["']\s*goal\s*=\s*["']([^"']+)["']\s*(?:priority\s*=\s*["']([^"']+)["'])?\s*\]/gi
  let match
  while ((match = delegatePattern.exec(content)) !== null) {
    const [, role, goal, priority] = match
    const roleLane = role as RoleLane

    if (!ROLE_PROMPTS[roleLane]) {
      console.warn(`[agent-runtime] Unknown role for delegation: ${role}`)
      continue
    }

    // Find or create a sub-agent for this role on this project
    const roleAssignments = store.getRoleAssignments(projectId)
    const assignment = roleAssignments.find(ra => ra.role === roleLane)
    let subAgentId = assignment?.agent_id

    if (!subAgentId) {
      // Auto-create a sub-agent for this role
      subAgentId = `agent-${roleLane}-${crypto.randomUUID().slice(0, 8)}`
      const project = store.getProject(projectId)
      const now = new Date().toISOString()
      store.upsertAgent({
        id: subAgentId,
        name: `${role.charAt(0).toUpperCase() + role.slice(1)} Agent`,
        slug: `${role}-${projectId.slice(0, 8)}`,
        description: `Sub-agent for ${role} on ${project?.name || 'project'}`,
        system_prompt: ROLE_PROMPTS[roleLane],
        specialization: role,
        default_model: 'anthropic/claude-sonnet-4-6',
        escalation_model: 'anthropic/claude-opus-4-5',
        max_budget_per_run: 2.0,
        allowed_tools: [],
        avatar_color: getRoleColor(roleLane),
        is_active: true,
        total_runs: 0,
        created_at: now,
        updated_at: now,
        project_id: projectId,
        project_name: project?.name,
        designation: 'sub-agent',
      })
      // Assign to role lane
      store.upsertRoleAssignment({
        id: `ra-${roleLane}-${crypto.randomUUID().slice(0, 8)}`,
        project_id: projectId,
        role: roleLane,
        agent_id: subAgentId,
        notes: `Auto-created by primary agent delegation`,
        created_at: now,
      })
      console.log(`[agent-runtime] Created sub-agent "${role}" (${subAgentId}) for project ${projectId}`)
    }

    // Create a task for the delegated work
    const taskId = `task-${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    store.upsertTask({
      id: taskId,
      title: goal.slice(0, 100),
      description: goal,
      priority: (priority as 'high' | 'medium' | 'low') || 'medium',
      status: 'queued',
      assigned_agent_id: subAgentId,
      created_by: 'agent',
      project_id: projectId,
      created_at: now,
      updated_at: now,
    })

    console.log(`[agent-runtime] Delegated to ${role}: "${goal}" (task ${taskId})`)
  }
}

function getRoleColor(role: RoleLane): string {
  const colors: Record<RoleLane, string> = {
    research: '#8b5cf6',
    strategy: '#3b82f6',
    product: '#10b981',
    content: '#f59e0b',
    performance_marketing: '#ef4444',
    consumer_insights: '#ec4899',
    advisor: '#6366f1',
  }
  return colors[role] || '#3b82f6'
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT BUILDER
// ---------------------------------------------------------------------------

function buildSystemPrompt(opts: {
  role?: RoleLane
  agentId: string
  projectId: string
  isPrimary?: boolean
}): string {
  const agent = store.getAgent(opts.agentId)
  const rolePrompt = opts.role ? ROLE_PROMPTS[opts.role] : ''
  const basePrompt = rolePrompt || agent?.system_prompt || 'You are a helpful AI assistant working on startup projects.'

  const projectContext = buildProjectContext(opts.projectId)

  const taskPrompt = `

When you identify specific actionable work items during our conversation, create tasks by outputting them on their own line in this format:

[TASK: title="Brief task title" priority="high|medium|low" description="What needs to be done"]

Only create tasks for concrete, actionable items. Don't duplicate existing tasks listed in the project context above.`

  const delegationPrompt = opts.isPrimary ? `

As the primary agent for this project, you can delegate work to specialized sub-agents. When a task requires deep expertise in a specific area, delegate it:

[DELEGATE: role="research|strategy|product|content|performance_marketing|consumer_insights|advisor" goal="Clear description of what needs to be done" priority="high|medium|low"]

The sub-agent will work independently and their findings will be available in the project context for future conversations. Use delegation for substantial work — quick questions don't need delegation.` : ''

  return `${basePrompt}

You are part of Mission Control — a founder's operating system for managing multiple startup projects. The founder is chatting with you directly, like they would in Claude Code.

Be conversational, helpful, and actionable. This is a real working conversation, not a task queue.${projectContext}${taskPrompt}${delegationPrompt}`
}

// ---------------------------------------------------------------------------
// CONVERSATION EXECUTION
// ---------------------------------------------------------------------------

/**
 * Start a new conversation with Claude.
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
  _runConversation(opts).catch((err) => {
    console.error(`[agent-runtime] Conversation ${opts.conversationId} error:`, err)
    store.addMessage(makeMessage({
      conversation_id: opts.conversationId,
      role: 'assistant',
      content: `Error: ${(err as Error).message}`,
      agent_id: opts.agentId,
    }))
    const conv = store.getConversation(opts.conversationId)
    if (conv) {
      conv.status = 'completed'
      conv.message_count = store.getMessages(opts.conversationId).length
      conv.last_message_at = new Date().toISOString()
      store.upsertConversation(conv)
    }
  })
}

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

  // Determine if this is the primary agent
  const project = store.getProject(opts.projectId)
  const isPrimary = project?.primary_agent_id === opts.agentId

  const systemPrompt = buildSystemPrompt({
    role: opts.role,
    agentId: opts.agentId,
    projectId: opts.projectId,
    isPrimary,
  })

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
        if (text) assistantContent += text + '\n'

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
          // Extract tasks and delegations
          extractAndCreateTasks(assistantContent, opts.projectId, opts.agentId)
          extractAndDelegate(assistantContent, opts.projectId, opts.agentId)

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
      conv.status = 'active'
      conv.total_cost += estimateCost(totalInputTokens, totalOutputTokens)
      conv.message_count = store.getMessages(opts.conversationId).length
      conv.last_message_at = new Date().toISOString()
      store.upsertConversation(conv)
    }
  } catch (err) {
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

// ---------------------------------------------------------------------------
// MESSAGE HANDLING
// ---------------------------------------------------------------------------

export async function sendMessage(conversationId: string, content: string, images?: import('./types').MessageImage[]): Promise<void> {
  const msg = makeMessage({
    conversation_id: conversationId,
    role: 'user',
    content,
  })
  if (images?.length) msg.images = images
  store.addMessage(msg)

  const conv = store.getConversation(conversationId)
  if (conv) {
    conv.message_count = store.getMessages(conversationId).length
    conv.last_message_at = new Date().toISOString()
    store.upsertConversation(conv)
  }

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

// ---------------------------------------------------------------------------
// TASK-ORIENTED RUNS (from boards)
// ---------------------------------------------------------------------------

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

  store.addMessage(makeMessage({
    conversation_id: conversationId,
    role: 'user',
    content: opts.prompt,
  }))

  if (task) store.updateTaskStatus(opts.taskId, 'running')

  _runConversation({
    conversationId,
    agentId: opts.agentId,
    projectId: opts.projectId,
    prompt: opts.prompt,
    role: opts.role,
    model: opts.model,
    cwd: opts.cwd,
  }).then(() => {
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

// ---------------------------------------------------------------------------
// SESSION MANAGEMENT
// ---------------------------------------------------------------------------

export function stopRun(runId: string): boolean {
  const session = activeSessions.get(runId)
  if (session) {
    session.abortController.abort()
    activeSessions.delete(runId)
    return true
  }
  return false
}

export function isSessionActive(conversationId: string): boolean {
  return activeSessions.has(conversationId)
}

export function getActiveRunIds(): string[] {
  return [...activeSessions.keys()]
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000
}
