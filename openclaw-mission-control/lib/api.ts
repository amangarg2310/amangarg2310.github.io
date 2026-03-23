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

/**
 * Frontend API client for OpenClaw Mission Control.
 *
 * Resolves the API base URL in this order:
 *  1. NEXT_PUBLIC_API_URL env var (for external backend)
 *  2. Relative /api (Next.js API routes — default)
 *
 * All functions return typed data matching lib/types.ts.
 * Falls back to the Next.js API routes which serve from
 * the in-memory DataStore (seeded with mock data in demo mode).
 */

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use env var or same-origin /api
    return process.env.NEXT_PUBLIC_API_URL || '/api'
  }
  // Server-side: always use relative
  return '/api'
}

async function fetchJson<T>(path: string): Promise<T> {
  const base = getBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText} — ${url}`)
  }
  return res.json() as Promise<T>
}

// --- Agents ---
export function fetchAgents(): Promise<Agent[]> {
  return fetchJson<Agent[]>('/agents')
}

export function fetchAgent(id: string): Promise<Agent> {
  return fetchJson<Agent>(`/agents/${id}`)
}

// --- Tasks ---
export function fetchTasks(): Promise<Task[]> {
  return fetchJson<Task[]>('/tasks')
}

// --- Runs ---
export function fetchRuns(): Promise<Run[]> {
  return fetchJson<Run[]>('/runs')
}

export function fetchRunDetail(id: string): Promise<{ run: Run; events: RunEvent[] }> {
  return fetchJson<{ run: Run; events: RunEvent[] }>(`/runs/${id}`)
}

// --- Conversations ---
export function fetchConversations(): Promise<Conversation[]> {
  return fetchJson<Conversation[]>('/conversations')
}

export function fetchMessages(conversationId: string): Promise<Message[]> {
  return fetchJson<Message[]>(`/conversations/${conversationId}/messages`)
}

export interface ConversationDetail {
  conversation: Conversation
  messages: Message[]
  events: RunEvent[]
  pagination: {
    offset: number
    limit: number
    hasMore: boolean
    totalLinesRead: number
  }
  session: {
    isLocked: boolean
    agentId: string | null
    sessionId: string
  }
}

export function fetchConversationDetail(
  conversationId: string,
  options?: { offset?: number; limit?: number; types?: string }
): Promise<ConversationDetail> {
  const params = new URLSearchParams()
  if (options?.offset) params.set('offset', String(options.offset))
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.types) params.set('types', options.types)
  const qs = params.toString()
  return fetchJson<ConversationDetail>(
    `/conversations/${conversationId}/detail${qs ? `?${qs}` : ''}`
  )
}

// --- Usage ---
export function fetchUsage(): Promise<{ daily: DailyUsage[]; models: ModelUsage[] }> {
  return fetchJson<{ daily: DailyUsage[]; models: ModelUsage[] }>('/usage')
}

// --- Activity ---
export function fetchActivity(
  limit = 20
): Promise<Array<{ id: string; text: string; time: string; type: string }>> {
  return fetchJson(`/activity?limit=${limit}`)
}
