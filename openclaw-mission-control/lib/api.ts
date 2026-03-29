import type {
  Agent,
  Task,
  Run,
  RunEvent,
  Message,
  Conversation,
  DailyUsage,
  ModelUsage,
  Project,
  RoleAssignment,
  ProjectContext,
  AutomationConfig,
  CommandCenterData,
} from './types'
import type { ExecutionRecommendation, TaskLaunchConfig } from './task-recommender'
import type { WorkflowInstance } from './workflow-chains'

/**
 * Frontend API client for Mission Control.
 *
 * Resolves the API base URL in this order:
 *  1. NEXT_PUBLIC_API_URL env var (for external backend)
 *  2. Relative /api (Next.js API routes — default)
 *
 * All functions return typed data matching lib/types.ts.
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
export function fetchTasks(projectId?: string | null): Promise<Task[]> {
  const qs = projectId ? `?project_id=${projectId}` : ''
  return fetchJson<Task[]>(`/tasks${qs}`)
}

export async function createTaskDraft(data: {
  goal: string
  project_id: string
  priority: string
  role?: string | null
  tier?: string | null
  autonomy?: string | null
  agent_strategy?: string | null
  assigned_agent_id?: string | null
  workflow_chain_id?: string | null
}): Promise<Task> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to create task draft: ${res.status}`)
  return res.json() as Promise<Task>
}

// --- Runs ---
export function fetchRuns(projectId?: string | null): Promise<Run[]> {
  const qs = projectId ? `?project_id=${projectId}` : ''
  return fetchJson<Run[]>(`/runs${qs}`)
}

export function fetchRunDetail(id: string): Promise<{ run: Run; events: RunEvent[] }> {
  return fetchJson<{ run: Run; events: RunEvent[] }>(`/runs/${id}`)
}

// --- Conversations ---
export function fetchConversations(projectId?: string | null): Promise<Conversation[]> {
  const qs = projectId ? `?project_id=${projectId}` : ''
  return fetchJson<Conversation[]>(`/conversations${qs}`)
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
  limit = 20,
  projectId?: string | null
): Promise<Array<{ id: string; text: string; time: string; type: string }>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (projectId) params.set('project_id', projectId)
  return fetchJson(`/activity?${params}`)
}

// --- Projects ---
export function fetchProjects(): Promise<Project[]> {
  return fetchJson<Project[]>('/projects')
}

export function fetchProjectContext(id: string): Promise<ProjectContext> {
  return fetchJson<ProjectContext>(`/projects/${id}`)
}

export async function deleteProject(id: string): Promise<void> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete project: ${res.status}`)
}

export function fetchProjectRoles(id: string): Promise<RoleAssignment[]> {
  return fetchJson<RoleAssignment[]>(`/projects/${id}/roles`)
}

export async function createProject(data: { name: string; description?: string; color?: string; repo_url?: string; repo_branch?: string }): Promise<Project> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to create project: ${res.status}`)
  return res.json() as Promise<Project>
}

export async function assignRole(
  projectId: string,
  data: { role: string; agent_id: string; notes?: string }
): Promise<RoleAssignment> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to assign role: ${res.status}`)
  return res.json() as Promise<RoleAssignment>
}

export async function unassignRole(projectId: string, role: string): Promise<void> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}/roles?role=${role}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to unassign role: ${res.status}`)
}

export async function updateProjectFocus(projectId: string, focus: string): Promise<ProjectContext> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ focus }),
  })
  if (!res.ok) throw new Error(`Failed to update focus: ${res.status}`)
  return res.json() as Promise<ProjectContext>
}

// --- Command Center ---
export function fetchCommandCenter(projectId: string): Promise<CommandCenterData> {
  return fetchJson<CommandCenterData>(`/projects/${projectId}/command-center`)
}

// --- Automations ---
export function fetchAutomations(projectId: string): Promise<AutomationConfig[]> {
  return fetchJson<AutomationConfig[]>(`/projects/${projectId}/automations`)
}

export async function toggleAutomation(
  projectId: string,
  jobId: string,
  role: string,
  enabled: boolean,
  cadence?: string,
): Promise<void> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}/automations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, role, enabled, cadence }),
  })
  if (!res.ok) throw new Error(`Failed to toggle automation: ${res.status}`)
}

// --- Recommendations ---
export async function fetchRecommendation(
  projectId: string,
  config: Partial<TaskLaunchConfig>,
): Promise<ExecutionRecommendation> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(`Failed to get recommendation: ${res.status}`)
  return res.json() as Promise<ExecutionRecommendation>
}

// --- Workflows ---
export function fetchWorkflows(projectId: string): Promise<WorkflowInstance[]> {
  return fetchJson<WorkflowInstance[]>(`/projects/${projectId}/workflows`)
}

export async function pauseWorkflow(projectId: string, workflowId: string): Promise<WorkflowInstance> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}/workflows`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_id: workflowId, action: 'pause' }),
  })
  if (!res.ok) throw new Error(`Failed to pause workflow: ${res.status}`)
  return res.json() as Promise<WorkflowInstance>
}

export async function resumeWorkflow(projectId: string, workflowId: string): Promise<WorkflowInstance> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}/workflows`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_id: workflowId, action: 'resume' }),
  })
  if (!res.ok) throw new Error(`Failed to resume workflow: ${res.status}`)
  return res.json() as Promise<WorkflowInstance>
}

export async function startWorkflow(projectId: string, chainId: string): Promise<WorkflowInstance> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/projects/${projectId}/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chain_id: chainId }),
  })
  if (!res.ok) throw new Error(`Failed to start workflow: ${res.status}`)
  return res.json() as Promise<WorkflowInstance>
}

// --- Chat ---
export async function sendChatMessage(data: {
  message: string
  images?: { data: string; name: string; type: string }[]
  conversation_id?: string
  project_id?: string
  agent_id?: string
  role?: string
}): Promise<{ ok: boolean; conversation_id?: string; run_id?: string }> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`)
  return res.json()
}

// --- Agent Control ---
export async function stopAgentRun(runId: string): Promise<void> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/runs/${runId}/stop`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(`Failed to stop run: ${res.status}`)
}
