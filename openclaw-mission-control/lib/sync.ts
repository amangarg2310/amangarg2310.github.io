/**
 * Sync layer: tracks active agent runs and updates store status.
 *
 * Instead of polling an external runtime, this layer:
 * - Monitors active agent sessions from agent-runtime.ts
 * - Periodically updates usage aggregates
 * - Provides health/status endpoints
 *
 * Server-only — never import from client components.
 */

let syncTimer: ReturnType<typeof setInterval> | null = null
let lastSyncAt: string | null = null
let syncCount = 0

/**
 * Run a single status check cycle.
 */
export async function syncOnce(): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  try {
    const { getActiveRunIds } = await import('./agent-runtime')
    const activeRuns = getActiveRunIds()
    syncCount++
    lastSyncAt = new Date().toISOString()

    if (syncCount <= 3 || syncCount % 60 === 0) {
      console.log(`[sync] Status check #${syncCount} — ${activeRuns.length} active runs`)
    }

    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    console.error(`[sync] Error: ${msg}`)
    return { ok: false, error: msg }
  }
}

/**
 * Start periodic status checks. Idempotent.
 */
export function startSync(): void {
  if (syncTimer) return

  console.log('[sync] Mission Control ready — agents powered by Claude Code SDK')

  // Initial check
  syncOnce()

  // Check every 10 seconds
  syncTimer = setInterval(() => {
    syncOnce()
  }, 10_000)
}

/**
 * Stop periodic checks.
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
    mode: 'sdk',
    runtimeUrl: null,
    running: syncTimer !== null,
    syncInProgress: false,
    lastSyncAt,
    lastSuccessAt: lastSyncAt,
    lastSyncError: null,
    syncCount,
    intervalMs: 10_000,
  }
}
