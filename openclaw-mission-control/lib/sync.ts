import { store } from './store'
import { fetchRuntimeData, isRuntimeConfigured, getRuntimeUrl } from './runtime-adapter'

/**
 * Sync layer: periodic hydration of lib/store.ts from the OpenClaw runtime.
 *
 * - If OPENCLAW_RUNTIME_URL is set, polls the runtime every SYNC_INTERVAL_MS
 * - If not set, store stays seeded with mock data (demo mode)
 * - Each sync replaces the full store contents with normalized runtime data
 * - Sync errors are logged but don't crash — stale data is better than no data
 *
 * Server-only — never import from client components.
 */

const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '15000', 10) // 15s default
const MIN_INTERVAL = 5000

let syncTimer: ReturnType<typeof setInterval> | null = null
let lastSyncAt: string | null = null
let lastSuccessAt: string | null = null
let lastSyncError: string | null = null
let syncCount = 0
let syncInProgress = false

/**
 * Run a single sync cycle: fetch from runtime, hydrate store.
 * Skips if a previous sync is still running (overlap guard).
 */
export async function syncOnce(): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!isRuntimeConfigured()) {
    return { ok: true } // Demo mode — nothing to sync
  }

  // Overlap guard: skip if previous sync is still running
  if (syncInProgress) {
    console.warn('[sync] Previous sync still running — skipping this tick')
    return { ok: true, skipped: true }
  }

  syncInProgress = true
  try {
    const data = await fetchRuntimeData()

    if (!data) {
      const msg = `Runtime unreachable at ${getRuntimeUrl()}`
      lastSyncError = msg
      console.warn(`[sync] ${msg}`)
      return { ok: false, error: msg }
    }

    // Hydrate store with normalized runtime data
    store.replaceAll({
      agents: data.agents,
      tasks: data.tasks,
      runs: data.runs,
      runEvents: data.runEvents,
      conversations: data.conversations,
      messages: data.messages,
      dailyUsage: data.dailyUsage,
      modelUsage: data.modelUsage,
    })

    syncCount++
    const now = new Date().toISOString()
    lastSyncAt = now
    lastSuccessAt = now
    lastSyncError = null

    if (syncCount <= 3 || syncCount % 20 === 0) {
      console.log(
        `[sync] Hydrated store from runtime (${data.agents.length} agents, ${data.runs.length} runs, ${data.tasks.length} tasks) — sync #${syncCount}`
      )
    }

    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    lastSyncAt = new Date().toISOString()
    lastSyncError = msg
    console.error(`[sync] Error: ${msg}`)
    return { ok: false, error: msg }
  } finally {
    syncInProgress = false
  }
}

/**
 * Start periodic sync. Idempotent — calling multiple times is safe.
 */
export function startSync(): void {
  if (syncTimer) return
  if (!isRuntimeConfigured()) {
    console.log('[sync] No OPENCLAW_RUNTIME_URL set — running in demo mode with mock data')
    return
  }

  const interval = Math.max(SYNC_INTERVAL_MS, MIN_INTERVAL)
  console.log(`[sync] Starting periodic sync every ${interval / 1000}s from ${getRuntimeUrl()}`)

  // Initial sync immediately
  syncOnce()

  syncTimer = setInterval(() => {
    syncOnce()
  }, interval)
}

/**
 * Stop periodic sync.
 */
export function stopSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
    console.log('[sync] Stopped')
  }
}

/**
 * Get sync status for health/debug endpoints.
 */
export function getSyncStatus() {
  return {
    mode: isRuntimeConfigured() ? 'live' : 'demo',
    runtimeUrl: getRuntimeUrl() || null,
    running: syncTimer !== null,
    syncInProgress,
    lastSyncAt,
    lastSuccessAt,
    lastSyncError,
    syncCount,
    intervalMs: SYNC_INTERVAL_MS,
  }
}
