/**
 * Next.js instrumentation file — called once on server startup.
 * Starts the sync layer if OPENCLAW_RUNTIME_URL is configured.
 */
export async function register() {
  // Only run on the server (Node.js runtime), not in Edge
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startSync } = await import('./lib/sync')
    startSync()
  }
}
