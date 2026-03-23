import type {
  Agent,
  Run,
  RunEvent,
  Message,
  Conversation,
  DailyUsage,
  ModelUsage,
} from '../types'
import type {
  RawAgent,
  RawSession,
  RawSessionList,
  RawTranscriptLine,
  RawTranscriptMessage,
  RawAssistantMessage,
  RawToolResultMessage,
  RawUsage,
  RawContentBlock,
} from './raw-types'
import { estimateCost, getModelTier } from '../costs'

/**
 * Normalizer: converts raw OpenClaw CLI/disk shapes into the dashboard's
 * strict types from lib/types.ts.
 *
 * Design decisions:
 *   - Agents map loosely: OpenClaw agents have workspace/bindings/routes,
 *     dashboard agents have name/description/budget. We bridge what we can,
 *     leave the rest at sensible defaults.
 *   - Sessions become Runs + Conversations. A session IS a run from the
 *     dashboard's perspective.
 *   - Transcript messages become Messages + RunEvents.
 *   - Token counts may be null/missing from OpenClaw — we default to 0 for
 *     aggregation safety but preserve null in cost estimation.
 */

// ─── Agent normalization ───────────────────────────────────────────

export function normalizeAgent(raw: RawAgent): Agent {
  // Extract a human-readable name from the agent ID
  const name = raw.id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return {
    id: raw.id,
    name,
    slug: raw.id,
    description: `Workspace: ${raw.workspace}`,
    system_prompt: '',
    specialization: raw.routes.length > 0 ? raw.routes.join(', ') : 'General',
    default_model: raw.model || 'unknown',
    escalation_model: '',
    max_budget_per_run: 0,
    allowed_tools: [],
    is_active: true, // OpenClaw doesn't expose active/inactive — assume active
    avatar_color: agentColor(raw.id),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total_runs: raw.bindings,
    status: raw.isDefault ? 'active' : 'active',
  }
}

/** Deterministic color from agent ID */
function agentColor(id: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return colors[Math.abs(hash) % colors.length]
}

// ─── Session → Run + Conversation ──────────────────────────────────

export function normalizeSession(
  raw: RawSession,
  agentMap: Map<string, Agent>,
  isLocked: boolean
): { run: Run; conversation: Conversation } {
  const agent = agentMap.get(raw.agentId)

  // Status derivation: don't overclaim certainty.
  // locked → running (lock file exists, session is active)
  // abortedLastRun → failed (explicit signal from OpenClaw)
  // otherwise → idle (we don't know — session exists but state is ambiguous)
  const status = isLocked
    ? 'running'
    : raw.abortedLastRun
      ? 'failed'
      : 'idle'

  const startedAt = new Date(raw.updatedAt - raw.ageMs).toISOString()
  const updatedAt = new Date(raw.updatedAt).toISOString()

  const inputTokens = raw.inputTokens ?? 0
  const outputTokens = raw.outputTokens ?? 0

  const run: Run = {
    id: raw.sessionId,
    task_id: '', // Sessions don't map to tasks natively
    agent_id: raw.agentId,
    status: status as Run['status'],
    actual_model_used: raw.model || 'unknown',
    started_at: startedAt,
    ended_at: isLocked ? null : updatedAt,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost: estimateCost(raw.model || 'unknown', inputTokens, outputTokens),
    retry_count: 0,
    parent_run_id: null,
    agent_name: agent?.name,
    task_title: sessionTitle(raw),
  }

  const conversation: Conversation = {
    id: `conv-${raw.sessionId}`,
    title: sessionTitle(raw),
    agent_id: raw.agentId,
    task_id: null,
    status: isLocked ? 'active' : 'idle', // Honest: unlocked means idle, not "completed"
    last_message_at: updatedAt,
    message_count: 0, // Updated when transcript is loaded
    total_cost: run.estimated_cost,
  }

  return { run, conversation }
}

/** Derive a readable title from the session key */
function sessionTitle(session: RawSession): string {
  // key format: "agent:main:telegram:direct:6966123628"
  const parts = session.key.split(':')
  if (parts.length >= 3) {
    return parts.slice(2).join(':')
  }
  return session.key
}

// ─── Transcript → Messages + RunEvents ─────────────────────────────

export function normalizeTranscriptLines(
  lines: RawTranscriptLine[],
  sessionId: string
): { messages: Message[]; events: RunEvent[] } {
  const messages: Message[] = []
  const events: RunEvent[] = []

  for (const line of lines) {
    switch (line.type) {
      case 'message':
        messages.push(normalizeMessage(line, sessionId))
        events.push(messageToEvent(line, sessionId))
        break
      case 'model_change':
        events.push({
          id: line.id,
          run_id: sessionId,
          timestamp: new Date(line.timestamp).toISOString(),
          event_type: 'model_called',
          status: 'completed',
          summary: `Model changed to ${line.modelId} (${line.provider})`,
          metadata: { provider: line.provider, modelId: line.modelId },
          input_tokens: null,
          output_tokens: null,
          estimated_cost: null,
          tool_name: null,
        })
        break
      case 'thinking_level_change':
        events.push({
          id: line.id,
          run_id: sessionId,
          timestamp: new Date(line.timestamp).toISOString(),
          event_type: 'thinking',
          status: 'completed',
          summary: `Thinking level: ${line.thinkingLevel}`,
          metadata: { thinkingLevel: line.thinkingLevel },
          input_tokens: null,
          output_tokens: null,
          estimated_cost: null,
          tool_name: null,
        })
        break
      case 'session':
        events.push({
          id: line.id,
          run_id: sessionId,
          timestamp: new Date(line.timestamp).toISOString(),
          event_type: 'started',
          status: 'running',
          summary: `Session started (v${line.version})`,
          metadata: { version: line.version, cwd: line.cwd },
          input_tokens: null,
          output_tokens: null,
          estimated_cost: null,
          tool_name: null,
        })
        break
      case 'custom':
        events.push({
          id: line.id,
          run_id: sessionId,
          timestamp: new Date(line.timestamp).toISOString(),
          event_type: 'response',
          status: 'completed',
          summary: `Custom event: ${line.customType}`,
          metadata: { customType: line.customType, ...line.data },
          input_tokens: null,
          output_tokens: null,
          estimated_cost: null,
          tool_name: null,
        })
        break
    }
  }

  return { messages, events }
}

function normalizeMessage(line: RawTranscriptMessage, sessionId: string): Message {
  const msg = line.message
  const ts = new Date(msg.timestamp ?? line.timestamp).toISOString()

  const base: Message = {
    id: line.id,
    conversation_id: `conv-${sessionId}`,
    role: normalizeRole(msg.role),
    content: extractTextContent(msg.content),
    agent_id: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    estimated_cost: null,
    created_at: ts,
  }

  if (msg.role === 'assistant') {
    const asst = msg as RawAssistantMessage
    base.model = asst.model ?? null
    if (asst.usage) {
      base.input_tokens = asst.usage.input ?? null
      base.output_tokens = asst.usage.output ?? null
      base.estimated_cost = asst.usage.cost?.total ?? null
    }
    base.tool_calls = extractToolCalls(asst.content)
  }

  if (msg.role === 'toolResult') {
    const tr = msg as RawToolResultMessage
    base.role = 'tool'
    base.tool_calls = tr.toolCallId
      ? [{ id: tr.toolCallId, name: tr.toolName || 'unknown', input: '', output: extractTextContent(tr.content), duration_ms: 0 }]
      : undefined
  }

  return base
}

function normalizeRole(role: string): Message['role'] {
  switch (role) {
    case 'user': return 'user'
    case 'assistant': return 'assistant'
    case 'toolResult': return 'tool'
    default: return 'system'
  }
}

function extractTextContent(blocks: RawContentBlock[]): string {
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

function extractToolCalls(blocks: RawContentBlock[]): Message['tool_calls'] {
  const calls = blocks.filter(
    (b): b is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown>; partialJson?: string } =>
      b.type === 'toolCall'
  )
  if (calls.length === 0) return undefined
  return calls.map((c) => ({
    id: c.id,
    name: c.name,
    input: JSON.stringify(c.arguments),
    output: '',
    duration_ms: 0,
  }))
}

function messageToEvent(line: RawTranscriptMessage, sessionId: string): RunEvent {
  const msg = line.message
  const usage = msg.role === 'assistant' ? (msg as RawAssistantMessage).usage : undefined

  let eventType: RunEvent['event_type'] = 'response'
  let toolName: string | null = null

  if (msg.role === 'toolResult') {
    eventType = 'tool_result'
    toolName = (msg as RawToolResultMessage).toolName ?? null
  } else if (msg.role === 'assistant' && msg.content.some((b) => b.type === 'toolCall')) {
    eventType = 'tool_call'
    const tc = msg.content.find((b) => b.type === 'toolCall') as { name?: string } | undefined
    toolName = tc?.name ?? null
  }

  return {
    id: `evt-${line.id}`,
    run_id: sessionId,
    timestamp: new Date(msg.timestamp ?? line.timestamp).toISOString(),
    event_type: eventType,
    status: 'completed',
    summary: summarizeMessage(msg),
    metadata: {},
    input_tokens: usage?.input ?? null,
    output_tokens: usage?.output ?? null,
    estimated_cost: usage?.cost?.total ?? null,
    tool_name: toolName,
  }
}

function summarizeMessage(msg: RawTranscriptMessage['message']): string {
  const text = extractTextContent(msg.content)
  if (text.length > 120) return text.slice(0, 117) + '...'
  return text || `[${msg.role}]`
}

// ─── Usage aggregation ─────────────────────────────────────────────

export function computeUsage(runs: Run[]): { daily: DailyUsage[]; models: ModelUsage[] } {
  const byDate = new Map<string, { input: number; output: number; cost: number; count: number }>()
  const byModel = new Map<string, { input: number; output: number; cost: number }>()

  for (const run of runs) {
    const date = run.started_at.slice(0, 10)
    const d = byDate.get(date) || { input: 0, output: 0, cost: 0, count: 0 }
    d.input += run.input_tokens
    d.output += run.output_tokens
    d.cost += run.estimated_cost
    d.count += 1
    byDate.set(date, d)

    const m = byModel.get(run.actual_model_used) || { input: 0, output: 0, cost: 0 }
    m.input += run.input_tokens
    m.output += run.output_tokens
    m.cost += run.estimated_cost
    byModel.set(run.actual_model_used, m)
  }

  const daily: DailyUsage[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      input_tokens: d.input,
      output_tokens: d.output,
      estimated_cost: d.cost,
      runs: d.count,
    }))

  const totalCost = [...byModel.values()].reduce((s, m) => s + m.cost, 0) || 1

  const models: ModelUsage[] = [...byModel.entries()].map(([model, m]) => ({
    model,
    tier: getModelTier(model),
    input_tokens: m.input,
    output_tokens: m.output,
    estimated_cost: m.cost,
    percentage: Math.round((m.cost / totalCost) * 100),
  }))

  return { daily, models }
}
