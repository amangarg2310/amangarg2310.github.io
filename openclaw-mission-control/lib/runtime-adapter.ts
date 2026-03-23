import type {
  Agent,
  Task,
  Run,
  RunEvent,
  Message,
  Conversation,
  DailyUsage,
  ModelUsage,
} from './types'
import { estimateCost, getModelTier } from './costs'

/**
 * Runtime adapter: fetches data from OpenClaw runtime and normalizes
 * it into the lib/types.ts contract.
 *
 * DATA SOURCE STRATEGY
 * ====================
 * OpenClaw's documented HTTP API is AI-facing (POST /v1/chat/completions,
 * POST /v1/responses), NOT a management/dashboard REST API. There are no
 * confirmed stable endpoints like GET /agents, GET /sessions, GET /tasks.
 *
 * The management surface is CLI/config oriented:
 *   - `openclaw agents list`, `openclaw sessions --json`, etc.
 *
 * This adapter defines an INTEGRATION CONTRACT — the shape we expect
 * from a thin bridge service (or future native endpoints) that sits
 * between OpenClaw internals and this dashboard. The endpoints below
 * are NOT guaranteed OpenClaw-native routes.
 *
 * Source mapping:
 *   agents  → derived from agent config/registry (openclaw agents list)
 *   sessions → derived from session store (openclaw sessions --json)
 *   tasks   → ADAPTER-OWNED — mission control's own concept, not native
 *
 * If you point OPENCLAW_RUNTIME_URL at a bridge service that exposes
 * /agents and /sessions, sync will work. If the runtime doesn't have
 * those endpoints yet, the adapter degrades gracefully (returns null,
 * store stays in demo mode).
 *
 * Server-only — never import from client components.
 */

const RUNTIME_URL = process.env.OPENCLAW_RUNTIME_URL || ''

// --- Raw runtime shapes (integration contract) ---
// These are the shapes we EXPECT from a bridge service or future
// native OpenClaw management API. Not confirmed native endpoints.
// Update when actual API surface is known.

interface RawRuntimeAgent {
  id: string
  name: string
  slug?: string
  description?: string
  system_prompt?: string
  specialization?: string
  default_model?: string
  escalation_model?: string
  max_budget_per_run?: number
  allowed_tools?: string[]
  is_active?: boolean
  avatar_color?: string
  created_at?: string
  updated_at?: string
  // Runtime may include stats inline
  total_runs?: number
  avg_cost_per_run?: number
  recent_runs?: number
  status?: string
}

interface RawRuntimeSession {
  id: string
  task_id?: string
  agent_id?: string
  title?: string
  status?: string
  model?: string
  started_at?: string
  ended_at?: string
  input_tokens?: number
  output_tokens?: number
  cost?: number
  retry_count?: number
  parent_session_id?: string
  events?: RawRuntimeEvent[]
  messages?: RawRuntimeMessage[]
}

interface RawRuntimeEvent {
  id: string
  timestamp?: string
  type?: string
  status?: string
  summary?: string
  metadata?: Record<string, unknown>
  input_tokens?: number
  output_tokens?: number
  cost?: number
  tool_name?: string
}

interface RawRuntimeMessage {
  id: string
  role?: string
  content?: string
  agent_id?: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  cost?: number
  tool_calls?: Array<{
    id: string
    name: string
    input: string
    output: string
    duration_ms: number
  }>
  created_at?: string
}

interface RawRuntimeTask {
  id: string
  title?: string
  description?: string
  priority?: string
  status?: string
  assigned_agent_id?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}

// --- Fetch helpers ---

async function fetchRuntime<T>(path: string): Promise<T | null> {
  if (!RUNTIME_URL) return null
  try {
    const res = await fetch(`${RUNTIME_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.error(`[runtime-adapter] ${path}: ${res.status} ${res.statusText}`)
      return null
    }
    return res.json() as Promise<T>
  } catch (err) {
    console.error(`[runtime-adapter] ${path}: ${(err as Error).message}`)
    return null
  }
}

// --- Normalizers ---

function normalizeAgent(raw: RawRuntimeAgent): Agent {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug || raw.name.toLowerCase().replace(/\s+/g, '-'),
    description: raw.description || '',
    system_prompt: raw.system_prompt || '',
    specialization: raw.specialization || 'General',
    default_model: raw.default_model || 'gpt-4o-mini',
    escalation_model: raw.escalation_model || 'claude-3.5-sonnet',
    max_budget_per_run: raw.max_budget_per_run ?? 1.0,
    allowed_tools: raw.allowed_tools || [],
    is_active: raw.is_active ?? true,
    avatar_color: raw.avatar_color || '#3b82f6',
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
    total_runs: raw.total_runs,
    avg_cost_per_run: raw.avg_cost_per_run,
    recent_runs: raw.recent_runs,
    status: (raw.status as Agent['status']) || 'active',
  }
}

function normalizeTask(raw: RawRuntimeTask): Task {
  return {
    id: raw.id,
    title: raw.title || 'Untitled Task',
    description: raw.description || '',
    priority: (raw.priority as Task['priority']) || 'medium',
    status: (raw.status as Task['status']) || 'queued',
    assigned_agent_id: raw.assigned_agent_id || null,
    created_by: raw.created_by || 'system',
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
  }
}

function normalizeSession(
  raw: RawRuntimeSession,
  agentMap: Map<string, Agent>
): { run: Run; events: RunEvent[]; conversation: Conversation; messages: Message[] } {
  const agent = raw.agent_id ? agentMap.get(raw.agent_id) : undefined

  const run: Run = {
    id: raw.id,
    task_id: raw.task_id || '',
    agent_id: raw.agent_id || '',
    status: (raw.status as Run['status']) || 'running',
    actual_model_used: raw.model || 'unknown',
    started_at: raw.started_at || new Date().toISOString(),
    ended_at: raw.ended_at || null,
    input_tokens: raw.input_tokens || 0,
    output_tokens: raw.output_tokens || 0,
    estimated_cost: raw.cost ?? estimateCost(raw.model || 'gpt-4o-mini', raw.input_tokens || 0, raw.output_tokens || 0),
    retry_count: raw.retry_count || 0,
    parent_run_id: raw.parent_session_id || null,
    agent_name: agent?.name,
    task_title: raw.title,
  }

  const events: RunEvent[] = (raw.events || []).map((e) => ({
    id: e.id,
    run_id: raw.id,
    timestamp: e.timestamp || new Date().toISOString(),
    event_type: (e.type as RunEvent['event_type']) || 'started',
    status: e.status || 'running',
    summary: e.summary || '',
    metadata: e.metadata || {},
    input_tokens: e.input_tokens ?? null,
    output_tokens: e.output_tokens ?? null,
    estimated_cost: e.cost ?? null,
    tool_name: e.tool_name ?? null,
  }))

  const conversation: Conversation = {
    id: `conv-${raw.id}`,
    title: raw.title || 'Untitled',
    agent_id: raw.agent_id || '',
    task_id: raw.task_id || null,
    status: raw.status === 'completed' ? 'completed' : raw.status === 'failed' ? 'archived' : 'active',
    last_message_at: raw.ended_at || raw.started_at || new Date().toISOString(),
    message_count: (raw.messages || []).length,
    total_cost: raw.cost || 0,
  }

  const messages: Message[] = (raw.messages || []).map((m) => ({
    id: m.id,
    conversation_id: `conv-${raw.id}`,
    role: (m.role as Message['role']) || 'assistant',
    content: m.content || '',
    agent_id: m.agent_id ?? null,
    model: m.model ?? null,
    input_tokens: m.input_tokens ?? null,
    output_tokens: m.output_tokens ?? null,
    estimated_cost: m.cost ?? null,
    tool_calls: m.tool_calls,
    created_at: m.created_at || new Date().toISOString(),
  }))

  return { run, events, conversation, messages }
}

// --- Usage computation ---

function computeUsage(runs: Run[]): { daily: DailyUsage[]; models: ModelUsage[] } {
  // Group runs by date
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

// --- Public API ---

export interface RuntimeData {
  agents: Agent[]
  tasks: Task[]
  runs: Run[]
  runEvents: RunEvent[]
  conversations: Conversation[]
  messages: Message[]
  dailyUsage: DailyUsage[]
  modelUsage: ModelUsage[]
}

/**
 * Fetch all data from the runtime bridge and normalize it.
 * Returns null if OPENCLAW_RUNTIME_URL is not set or unreachable.
 *
 * Endpoint contract (bridge service must provide):
 *   GET /agents   → RawRuntimeAgent[]   (from agent config/registry)
 *   GET /sessions → RawRuntimeSession[]  (from session store)
 *   GET /tasks    → RawRuntimeTask[]     (OPTIONAL — adapter-owned)
 *
 * None of these are confirmed native OpenClaw REST endpoints.
 * They represent the contract between this dashboard and a bridge layer.
 */
export async function fetchRuntimeData(): Promise<RuntimeData | null> {
  if (!RUNTIME_URL) return null

  // Fetch from bridge service — agents and sessions are the core sources.
  // Tasks are optional (adapter-owned concept, may not exist on bridge).
  const [rawAgents, rawSessions, rawTasks] = await Promise.all([
    fetchRuntime<RawRuntimeAgent[]>('/agents'),
    fetchRuntime<RawRuntimeSession[]>('/sessions'),
    fetchRuntime<RawRuntimeTask[]>('/tasks'), // Optional — null is fine
  ])

  // If neither agents nor sessions are reachable, runtime is down
  if (!rawAgents && !rawSessions) return null

  const agents = (rawAgents || []).map(normalizeAgent)
  const agentMap = new Map(agents.map((a) => [a.id, a]))
  const tasks = (rawTasks || []).map(normalizeTask)

  const allRuns: Run[] = []
  const allEvents: RunEvent[] = []
  const allConversations: Conversation[] = []
  const allMessages: Message[] = []

  for (const session of rawSessions || []) {
    const { run, events, conversation, messages } = normalizeSession(session, agentMap)
    allRuns.push(run)
    allEvents.push(...events)
    allConversations.push(conversation)
    allMessages.push(...messages)
  }

  const { daily, models } = computeUsage(allRuns)

  return {
    agents,
    tasks,
    runs: allRuns,
    runEvents: allEvents,
    conversations: allConversations,
    messages: allMessages,
    dailyUsage: daily,
    modelUsage: models,
  }
}

/**
 * Check if runtime is configured and reachable.
 */
export function isRuntimeConfigured(): boolean {
  return RUNTIME_URL.length > 0
}

export function getRuntimeUrl(): string {
  return RUNTIME_URL
}
