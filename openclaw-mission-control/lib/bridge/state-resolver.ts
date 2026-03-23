import { existsSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

/**
 * Resolves the OpenClaw state directory.
 *
 * Resolution order:
 *   1. Explicit path passed to the function (from bridge config)
 *   2. OPENCLAW_STATE_DIR env var
 *   3. Profile-derived default:
 *      - ~/.openclaw           (default profile)
 *      - ~/.openclaw-<profile> (named profile, via OPENCLAW_PROFILE)
 *   4. Fallback: ~/.openclaw
 *
 * Returns the resolved absolute path. Throws if the directory does not exist
 * and `mustExist` is true (default: false — allows pre-configuration before
 * OpenClaw is installed).
 */
export function resolveStateDir(options?: {
  explicitPath?: string
  mustExist?: boolean
}): string {
  const { explicitPath, mustExist = false } = options ?? {}

  // 1. Explicit path from bridge config
  if (explicitPath) {
    const resolved = resolve(explicitPath)
    if (mustExist && !existsSync(resolved)) {
      throw new Error(`OpenClaw state dir not found at explicit path: ${resolved}`)
    }
    return resolved
  }

  // 2. OPENCLAW_STATE_DIR env var
  const envDir = process.env.OPENCLAW_STATE_DIR
  if (envDir) {
    const resolved = resolve(envDir)
    if (mustExist && !existsSync(resolved)) {
      throw new Error(`OpenClaw state dir not found at OPENCLAW_STATE_DIR: ${resolved}`)
    }
    return resolved
  }

  // 3. Profile-derived default
  const home = homedir()
  const profile = process.env.OPENCLAW_PROFILE
  const profileDir = profile && profile !== 'default'
    ? resolve(home, `.openclaw-${profile}`)
    : resolve(home, '.openclaw')

  if (existsSync(profileDir)) {
    return profileDir
  }

  // 4. Fallback to ~/.openclaw
  const fallback = resolve(home, '.openclaw')
  if (mustExist && !existsSync(fallback)) {
    throw new Error(
      `OpenClaw state dir not found. Checked: ${profileDir !== fallback ? `${profileDir}, ` : ''}${fallback}. ` +
      'Set OPENCLAW_STATE_DIR or install OpenClaw.'
    )
  }
  return fallback
}

/**
 * Resolve the path to a session's transcript .jsonl file.
 * Convention: <stateDir>/sessions/<sessionId>.jsonl
 */
export function resolveTranscriptPath(stateDir: string, sessionId: string): string {
  return resolve(stateDir, 'sessions', `${sessionId}.jsonl`)
}

/**
 * Check if a session is currently locked (active/in-progress).
 * Convention: <stateDir>/sessions/<sessionId>.jsonl.lock
 */
export function resolveTranscriptLockPath(stateDir: string, sessionId: string): string {
  return resolve(stateDir, 'sessions', `${sessionId}.jsonl.lock`)
}
