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
} from './types'
import {
  fetchAgents,
  fetchTasks,
  fetchRuns,
  fetchRunDetail,
  fetchConversations,
  fetchMessages,
  fetchUsage,
  fetchActivity,
} from './api'

/**
 * Generic data-fetching hook.
 * Returns { data, loading, error } with typed data.
 */
function useApi<T>(fetcher: () => Promise<T>, fallback: T): {
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
  }, [])

  return { data, loading, error }
}

// --- Typed hooks ---

export function useAgents() {
  return useApi<Agent[]>(fetchAgents, [])
}

export function useTasks() {
  return useApi<Task[]>(fetchTasks, [])
}

export function useRuns() {
  return useApi<Run[]>(fetchRuns, [])
}

export function useRunDetail(id: string) {
  return useApi<{ run: Run | null; events: RunEvent[] }>(
    () => fetchRunDetail(id),
    { run: null, events: [] }
  )
}

export function useConversations() {
  return useApi<Conversation[]>(fetchConversations, [])
}

export function useMessages(conversationId: string) {
  return useApi<Message[]>(
    () => fetchMessages(conversationId),
    []
  )
}

export function useUsage() {
  return useApi<{ daily: DailyUsage[]; models: ModelUsage[] }>(
    fetchUsage,
    { daily: [], models: [] }
  )
}

export function useActivity(limit = 20) {
  return useApi<Array<{ id: string; text: string; time: string; type: string }>>(
    () => fetchActivity(limit),
    []
  )
}

// --- Derived/computed hooks ---

export function useDashboardStats() {
  const { data: runs, loading: runsLoading } = useRuns()
  const { data: tasks, loading: tasksLoading } = useTasks()
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
