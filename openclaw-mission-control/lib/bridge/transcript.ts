import { createReadStream, existsSync } from 'fs'
import { createInterface } from 'readline'
import { resolveTranscriptPath, resolveTranscriptLockPath } from './state-resolver'
import type { RawTranscriptLine } from './raw-types'

/**
 * Direct .jsonl transcript reader for on-demand conversation detail.
 *
 * Reads transcript files line-by-line with optional pagination (offset/limit)
 * to avoid loading entire transcripts into memory for long sessions.
 *
 * Lock-file existence check tells the caller whether the session is still active.
 */

export interface TranscriptReadOptions {
  /** Skip this many lines from the start */
  offset?: number
  /** Max lines to return (0 = unlimited) */
  limit?: number
  /** Only return lines of these types */
  typeFilter?: RawTranscriptLine['type'][]
}

export interface TranscriptResult {
  lines: RawTranscriptLine[]
  totalLinesRead: number
  /** Whether a .jsonl.lock file exists (session is active) */
  isLocked: boolean
  /** Whether there are more lines beyond offset+limit */
  hasMore: boolean
}

/**
 * Read transcript lines from a session's .jsonl file.
 *
 * Returns null if the file does not exist.
 */
export async function readTranscript(
  stateDir: string,
  sessionId: string,
  options?: TranscriptReadOptions
): Promise<TranscriptResult | null> {
  const filePath = resolveTranscriptPath(stateDir, sessionId)
  if (!existsSync(filePath)) return null

  const lockPath = resolveTranscriptLockPath(stateDir, sessionId)
  const isLocked = existsSync(lockPath)

  const offset = options?.offset ?? 0
  const limit = options?.limit ?? 0
  const typeFilter = options?.typeFilter
    ? new Set(options.typeFilter)
    : null

  const lines: RawTranscriptLine[] = []
  let lineIndex = 0
  let matchIndex = 0
  let hasMore = false

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const rawLine of rl) {
    lineIndex++

    const trimmed = rawLine.trim()
    if (!trimmed) continue

    let parsed: RawTranscriptLine
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // Skip malformed lines silently
      continue
    }

    // Type filter
    if (typeFilter && !typeFilter.has(parsed.type)) continue

    // Pagination: skip until offset
    if (matchIndex < offset) {
      matchIndex++
      continue
    }

    // Pagination: check limit
    if (limit > 0 && lines.length >= limit) {
      hasMore = true
      break
    }

    lines.push(parsed)
    matchIndex++
  }

  return {
    lines,
    totalLinesRead: lineIndex,
    isLocked,
    hasMore,
  }
}

/**
 * Check if a session is currently active (has a .jsonl.lock file).
 */
export function isSessionActive(stateDir: string, sessionId: string): boolean {
  return existsSync(resolveTranscriptLockPath(stateDir, sessionId))
}

/**
 * Check if a transcript file exists for a session.
 */
export function hasTranscript(stateDir: string, sessionId: string): boolean {
  return existsSync(resolveTranscriptPath(stateDir, sessionId))
}
