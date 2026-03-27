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
  AutomationConfig,
  CommandCenterData,
} from './types'
import type { ExecutionRecommendation, TaskLaunchConfig, RecommendationOverrides } from './task-recommender'
import type { WorkflowInstance } from './workflow-chains'
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
  fetchCommandCenter,
  fetchAutomations,
  fetchRecommendation,
  fetchWorkflows,
} from './api'
import type { ConversationDetail } from './api'

/**
 * Generic data-fetching hook with optional deps for re-fetching.
 * Pass refetchInterval (ms) to enable background polling.
 */
function useApi<T>(fetcher: () => Promise<T>, fallback: T, deps: unknown[] = [], refetchInterval?: number): {
  data: T
  loading: boolean
  error: string | null
  lastFetchedAt: number | null
} {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
          setLastFetchedAt(Date.now())
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

  // Background polling — silently refresh data without resetting loading state
  useEffect(() => {
    if (!refetchInterval) return
    const interval = setInterval(() => {
      fetcher()
        .then((result) => {
          setData(result)
          setLastFetchedAt(Date.now())
        })
        .catch(() => { /* silently ignore polling errors */ })
    }, refetchInterval)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchInterval])

  return { data, loading, error, lastFetchedAt }
}

// --- Typed hooks ---

export function useAgents() {
  return useApi<Agent[]>(fetchAgents, [])
}

export function useTasks(projectId?: string | null, refetchInterval?: number) {
  return useApi<Task[]>(
    () => fetchTasks(projectId),
    [],
    [projectId ?? null],
    refetchInterval,
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

  // Count approvals from both tasks and runs to avoid mismatch
  const taskApprovals = tasks.filter((t) => t.status === 'needs_approval')
  const runApprovals = runs.filter((r) => r.status === 'needs_approval')
  // Deduplicate: count tasks, plus runs whose task_id isn't already counted
  const taskIds = new Set(taskApprovals.map((t) => t.id))
  const extraRunApprovals = runApprovals.filter((r) => !taskIds.has(r.task_id))
  const approvalCount = taskApprovals.length + extraRunApprovals.length

  return {
    activeRunCount: runs.filter((r) => r.status === 'running').length,
    approvalCount,
    onlineAgentCount: agents.filter((a) => a.is_active).length,
  }
}

// --- Command Center ---

export function useCommandCenter(projectId: string | null) {
  return useApi<CommandCenterData | null>(
    () => projectId ? fetchCommandCenter(projectId) : Promise.resolve(null),
    null,
    [projectId],
  )
}

// --- Automations ---

export function useAutomations(projectId: string | null) {
  return useApi<AutomationConfig[]>(
    () => projectId ? fetchAutomations(projectId) : Promise.resolve([]),
    [],
    [projectId],
  )
}

// --- Recommendations ---

export function useRecommendation(
  projectId: string | null,
  config: Partial<TaskLaunchConfig>,
  overrides?: RecommendationOverrides,
) {
  const [data, setData] = useState<ExecutionRecommendation | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !config.goal || config.goal.length < 3) {
      setData(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      const payload = overrides
        ? { ...config, overrides }
        : config
      fetchRecommendation(projectId, payload)
        .then((result) => {
          if (!cancelled) setData(result)
        })
        .catch(() => {
          if (!cancelled) setData(null)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300) // debounce

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, config.goal, config.urgency, config.tradeoff, config.recurring, overrides?.tier, overrides?.autonomy, overrides?.agent_strategy])

  return { data, loading }
}

// --- Workflows ---

export function useWorkflows(projectId: string | null) {
  return useApi<WorkflowInstance[]>(
    () => projectId ? fetchWorkflows(projectId) : Promise.resolve([]),
    [],
    [projectId],
  )
}
