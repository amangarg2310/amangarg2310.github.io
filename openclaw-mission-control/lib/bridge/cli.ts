import { execFile } from 'child_process'
import type { RawAgent, RawSessionList } from './raw-types'

/**
 * Shell-out to OpenClaw CLI for list/sync data.
 *
 * Uses `openclaw agents list --json` and `openclaw sessions --json`
 * which produce stable JSON output suitable for periodic sync.
 *
 * All functions accept an optional `cliPath` override (defaults to "openclaw"
 * on PATH) and return null on failure instead of throwing.
 */

const DEFAULT_CLI = 'openclaw'
const TIMEOUT_MS = 30_000

interface CliOptions {
  cliPath?: string
  profile?: string
  timeoutMs?: number
}

function execCli(
  args: string[],
  options?: CliOptions
): Promise<string | null> {
  const bin = options?.cliPath || DEFAULT_CLI
  const timeout = options?.timeoutMs || TIMEOUT_MS

  // Inject profile flag if specified
  const fullArgs = options?.profile
    ? ['--profile', options.profile, ...args]
    : args

  return new Promise((resolve) => {
    execFile(
      bin,
      fullArgs,
      { timeout, maxBuffer: 10 * 1024 * 1024 }, // 10MB buffer
      (err, stdout, stderr) => {
        if (err) {
          console.error(`[bridge/cli] ${bin} ${fullArgs.join(' ')} failed:`, err.message)
          if (stderr) console.error(`[bridge/cli] stderr: ${stderr}`)
          resolve(null)
          return
        }
        resolve(stdout)
      }
    )
  })
}

function parseJson<T>(raw: string | null, label: string): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.error(`[bridge/cli] Failed to parse ${label} JSON:`, (err as Error).message)
    return null
  }
}

/**
 * Fetch agent list via `openclaw agents list --json`.
 */
export async function fetchAgents(options?: CliOptions): Promise<RawAgent[] | null> {
  const stdout = await execCli(['agents', 'list', '--json'], options)
  return parseJson<RawAgent[]>(stdout, 'agents')
}

/**
 * Fetch session list via `openclaw sessions --json`.
 *
 * Returns a RawSessionList which contains the sessions array plus metadata.
 * Pass `agentId` to filter to a specific agent's sessions.
 */
export async function fetchSessions(
  options?: CliOptions & { agentId?: string }
): Promise<RawSessionList | null> {
  const args = ['sessions', '--json']
  if (options?.agentId) {
    args.push('--agent', options.agentId)
  }
  const stdout = await execCli(args, options)
  return parseJson<RawSessionList>(stdout, 'sessions')
}
