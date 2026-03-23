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
  resolveStateDir,
  fetchAgents,
  fetchSessions,
  isSessionActive,
  getSessionCwd,
  normalizeAgent as bridgeNormalizeAgent,
  normalizeSession as bridgeNormalizeSession,
  computeUsage,
} from './bridge'
import { applyProjectMapping } from './project-mapper'
import { store } from './store'

/**
 * Runtime adapter: fetches data from OpenClaw via local bridge
 * (CLI shell-out + disk reads) and normalizes into lib/types.ts contract.
 *
 * DATA SOURCE STRATEGY
 * ====================
 * The bridge uses three access patterns:
 *   1. CLI shell-out (`openclaw agents list --json`, `openclaw sessions --json`)
 *      for list/sync data — stable, periodically polled.
 *   2. Direct .jsonl reads for on-demand conversation detail with pagination.
 *   3. .jsonl.lock existence checks for session activity status.
 *
 * Configuration:
 *   - OPENCLAW_STATE_DIR: explicit state directory path
 *   - OPENCLAW_PROFILE: named profile (→ ~/.openclaw-<profile>)
 *   - OPENCLAW_CLI_PATH: path to openclaw binary (default: "openclaw" on PATH)
 *
 * When openclaw CLI is not available, the adapter returns null and the
 * dashboard falls back to demo mode with mock data.
 *
 * Server-only — never import from client components.
 */

let cachedStateDir: string | null = null

function getStateDir(): string {
  if (!cachedStateDir) {
    cachedStateDir = resolveStateDir({
      explicitPath: process.env.OPENCLAW_STATE_DIR,
      mustExist: false,
    })
  }
  return cachedStateDir
}

function getCliOptions() {
  return {
    cliPath: process.env.OPENCLAW_CLI_PATH,
    profile: process.env.OPENCLAW_PROFILE,
  }
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
 * Fetch all data from the OpenClaw bridge and normalize it.
 * Returns null if the CLI is unavailable or returns no data.
 *
 * Data flow:
 *   openclaw agents list --json → RawAgent[] → Agent[]
 *   openclaw sessions --json    → RawSessionList → Run[] + Conversation[]
 *   .jsonl.lock checks          → session active status
 *
 * Tasks are dashboard-owned (not native to OpenClaw) — returned as empty.
 */
export async function fetchRuntimeData(): Promise<RuntimeData | null> {
  const cliOpts = getCliOptions()
  const stateDir = getStateDir()

  // Fetch agents and sessions in parallel via CLI
  const [rawAgents, rawSessionList] = await Promise.all([
    fetchAgents(cliOpts),
    fetchSessions(cliOpts),
  ])

  // If neither source returned data, CLI is unavailable
  if (!rawAgents && !rawSessionList) return null

  const agents = (rawAgents || []).map(bridgeNormalizeAgent)
  const agentMap = new Map(agents.map((a) => [a.id, a]))

  const allRuns: Run[] = []
  const allConversations: Conversation[] = []

  const rawSessions = rawSessionList?.sessions || []
  for (const session of rawSessions) {
    const locked = isSessionActive(stateDir, session.agentId, session.sessionId)
    const { run, conversation } = bridgeNormalizeSession(session, agentMap, locked)
    allRuns.push(run)
    allConversations.push(conversation)
  }

  // Read per-session cwd from transcript first line (precise, per-session)
  const sessionCwds = new Map<string, string>()
  for (const session of rawSessions) {
    const cwd = getSessionCwd(stateDir, session.agentId, session.sessionId)
    if (cwd) sessionCwds.set(session.sessionId, cwd)
  }

  // Build agent workspace lookup from raw agent data (coarse fallback)
  const agentWorkspaces = new Map<string, string>()
  for (const raw of rawAgents || []) {
    if (raw.workspace) agentWorkspaces.set(raw.id, raw.workspace)
  }

  // Auto-map sessions to projects:
  // transcript cwd (precise) → agent workspace (fallback) → agent default
  const projects = store.getProjects()
  const roleAssignments = store.getRoleAssignments()
  applyProjectMapping(allRuns, allConversations, sessionCwds, agentWorkspaces, projects, roleAssignments)

  const { daily, models } = computeUsage(allRuns)

  return {
    agents,
    tasks: [], // Tasks are dashboard-owned, not from OpenClaw
    runs: allRuns,
    runEvents: [], // Populated on-demand via transcript reads
    conversations: allConversations,
    messages: [], // Populated on-demand via transcript reads
    dailyUsage: daily,
    modelUsage: models,
  }
}

/**
 * Check if the bridge is configured (i.e., can we attempt CLI access).
 * Returns true if any OpenClaw config exists — we'll try CLI and degrade
 * gracefully if it's not installed.
 */
export function isRuntimeConfigured(): boolean {
  // If explicit env vars are set, assume configured
  if (process.env.OPENCLAW_STATE_DIR || process.env.OPENCLAW_CLI_PATH) return true
  // Otherwise, check if we can resolve a state dir that exists
  try {
    resolveStateDir({ mustExist: true })
    return true
  } catch {
    return false
  }
}

export function getRuntimeUrl(): string {
  return `local:${getStateDir()}`
}
