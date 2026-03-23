/**
 * OpenClaw Bridge — local-first data access layer.
 *
 * Access pattern:
 *   - CLI shell-out for list/sync data (agents, sessions)
 *   - Direct .jsonl reads for on-demand conversation detail
 *   - .jsonl.lock existence checks for session activity status
 *
 * State directory resolution:
 *   1. Explicit path from bridge config
 *   2. OPENCLAW_STATE_DIR env var
 *   3. Profile-derived default (~/.openclaw or ~/.openclaw-<profile>)
 *   4. Fallback: ~/.openclaw
 */

export { resolveStateDir, resolveTranscriptPath, resolveTranscriptLockPath } from './state-resolver'
export { fetchAgents, fetchSessions } from './cli'
export { readTranscript, isSessionActive, hasTranscript, getSessionCwd } from './transcript'
export type { TranscriptReadOptions, TranscriptResult } from './transcript'
export {
  normalizeAgent,
  normalizeSession,
  normalizeTranscriptLines,
  computeUsage,
} from './normalizer'
export type {
  RawAgent,
  RawSession,
  RawSessionList,
  RawTranscriptLine,
  RawTranscriptMessage,
  RawMessage,
  RawUsage,
  RawContentBlock,
} from './raw-types'
