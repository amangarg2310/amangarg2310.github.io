/**
 * Default empty data.
 *
 * All runtime data comes from agent-runtime.ts (lib/sync.ts → store.replaceAll()).
 * Dashboard-owned data (projects, roles, automations) persists to disk via project-store.ts.
 *
 * This file exists only to satisfy the store constructor's fallback imports.
 * Every array is intentionally empty — no demo/mock data.
 */

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
  AutomationConfig,
} from './types'
import type { WorkflowInstance } from './workflow-chains'

export const agents: Agent[] = []
export const tasks: Task[] = []
export const runs: Run[] = []
export const runEvents: RunEvent[] = []
export const conversations: Conversation[] = []
export const messages: Message[] = []
export const dailyUsage: DailyUsage[] = []
export const modelUsage: ModelUsage[] = []
export const projects: Project[] = []
export const roleAssignments: RoleAssignment[] = []
export const automationConfigs: AutomationConfig[] = []
export const workflowInstances: WorkflowInstance[] = []

// --- Aggregate helpers (operate on live store data, not these empty defaults) ---

export function getTodayUsage() {
  return { tokens: 0, cost: 0, runs: 0 }
}

export function getActiveRuns() {
  return runs.filter((r) => r.status === 'running')
}

export function getQueuedTasks() {
  return tasks.filter((t) => t.status === 'queued')
}

export function getFailedRuns() {
  return runs.filter((r) => r.status === 'failed')
}

export function getStalledRuns() {
  return runs.filter((r) => r.status === 'stalled')
}

export function getNeedsApproval() {
  return tasks.filter((t) => t.status === 'needs_approval')
}

export function getOnlineAgents() {
  return agents.filter((a) => a.is_active)
}

export function getRecentActivity() {
  return [] as Array<{ id: string; text: string; time: string; type: string }>
}
