'use client'

import { useState, useEffect } from 'react'
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
} from './types'
import {
  fetchAgents,
  fetchTasks,
  fetchRuns,
  fetchRunDetail,
  fetchConversations,
  fetchMessages,
  fetchConversationDetail,
  fetchUsage,
  fetchActivity,
  fetchProjects,
  fetchProjectContext,
  fetchProjectRoles,
} from './api'
import type { ConversationDetail } from './api'

/**
 * Generic data-fetching hook with optional deps for re-fetching.
 */
function useApi<T>(fetcher: () => Promise<T>, fallback: T, deps: unknown[] = []): {
  data: T
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}

// --- Typed hooks ---

export function useAgents() {
  return useApi<Agent[]>(fetchAgents, [])
}

export function useTasks(projectId?: string | null) {
  return useApi<Task[]>(
    () => fetchTasks(projectId),
    [],
    [projectId ?? null]
  )
}

export function useRuns(projectId?: string | null) {
  return useApi<Run[]>(
    () => fetchRuns(projectId),
    [],
    [projectId ?? null]
  )
}

export function useRunDetail(id: string) {
  return useApi<{ run: Run | null; events: RunEvent[] }>(
    () => fetchRunDetail(id),
    { run: null, events: [] }
  )
}

export function useConversations(projectId?: string | null) {
  return useApi<Conversation[]>(
    () => fetchConversations(projectId),
    [],
    [projectId ?? null]
  )
}

export function useMessages(conversationId: string) {
  return useApi<Message[]>(
    () => fetchMessages(conversationId),
    []
  )
}

const EMPTY_DETAIL: ConversationDetail = {
  conversation: null as unknown as Conversation,
  messages: [],
  events: [],
  pagination: { offset: 0, limit: 100, hasMore: false, totalLinesRead: 0 },
  session: { isLocked: false, agentId: null, sessionId: '' },
}

export function useConversationDetail(conversationId: string) {
  const [data, setData] = useState<ConversationDetail>(EMPTY_DETAIL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!conversationId) {
      setData(EMPTY_DETAIL)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchConversationDetail(conversationId)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [conversationId])

  return { data, loading, error }
}

export function useUsage() {
  return useApi<{ daily: DailyUsage[]; models: ModelUsage[] }>(
    fetchUsage,
    { daily: [], models: [] }
  )
}

export function useActivity(limit = 20, projectId?: string | null) {
  return useApi<Array<{ id: string; text: string; time: string; type: string }>>(
    () => fetchActivity(limit, projectId),
    [],
    [projectId ?? null]
  )
}

// --- Project hooks ---

export function useProjects() {
  return useApi<Project[]>(fetchProjects, [])
}

export function useProjectContext(projectId: string | null) {
  return useApi<ProjectContext | null>(
    () => projectId ? fetchProjectContext(projectId) : Promise.resolve(null),
    null,
    [projectId]
  )
}

export function useProjectRoles(projectId: string | null) {
  return useApi<RoleAssignment[]>(
    () => projectId ? fetchProjectRoles(projectId) : Promise.resolve([]),
    [],
    [projectId]
  )
}

// --- Derived/computed hooks ---

export function useDashboardStats(projectId?: string | null) {
  const { data: runs, loading: runsLoading } = useRuns(projectId)
  const { data: tasks, loading: tasksLoading } = useTasks(projectId)
  const { data: usage } = useUsage()

  const activeRuns = runs.filter((r) => r.status === 'running')
  const needsApproval = tasks.filter((t) => t.status === 'needs_approval')
  const failedRuns = runs.filter((r) => r.status === 'failed')
  const stalledRuns = runs.filter((r) => r.status === 'stalled')
  const queuedTasks = tasks.filter((t) => t.status === 'queued')

  const today = usage.daily[usage.daily.length - 1]
  const todayUsage = today
    ? { tokens: today.input_tokens + today.output_tokens, cost: today.estimated_cost, runs: today.runs }
    : { tokens: 0, cost: 0, runs: 0 }

  return {
    activeRuns,
    needsApproval,
    failedRuns,
    stalledRuns,
    queuedTasks,
    todayUsage,
    loading: runsLoading || tasksLoading,
  }
}

export function useSidebarStats() {
  const { data: runs } = useRuns()
  const { data: tasks } = useTasks()
  const { data: agents } = useAgents()

  return {
    activeRunCount: runs.filter((r) => r.status === 'running').length,
    approvalCount: tasks.filter((t) => t.status === 'needs_approval').length,
    onlineAgentCount: agents.filter((a) => a.is_active).length,
  }
}
