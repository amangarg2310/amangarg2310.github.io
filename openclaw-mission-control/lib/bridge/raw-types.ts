/**
 * Raw shapes from OpenClaw CLI output and on-disk transcript files.
 *
 * These types mirror the actual data formats — they are intentionally
 * permissive. The normalizer (normalizer.ts) converts these into the
 * strict dashboard types from lib/types.ts.
 *
 * Sources:
 *   - `openclaw agents list --json`  → RawAgent[]
 *   - `openclaw sessions --json`     → RawSessionList
 *   - `.jsonl` transcript files      → RawTranscriptLine[]
 */

// ═══════════════════════════════════════════════════
// From: openclaw agents list --json
// ═══════════════════════════════════════════════════

export interface RawAgent {
  id: string
  workspace: string
  agentDir: string
  model: string // e.g. "openai-codex/gpt-5.4"
  bindings: number
  isDefault: boolean
  routes: string[]
}

// ═══════════════════════════════════════════════════
// From: openclaw sessions --json
// ═══════════════════════════════════════════════════

export interface RawSessionList {
  path: string | null // null in aggregated/all-agent output
  count: number
  activeMinutes: number | null
  sessions: RawSession[]
}

export interface RawSession {
  key: string // e.g. "agent:main:telegram:direct:6966123628"
  updatedAt: number // epoch ms
  ageMs: number
  sessionId: string // UUID
  systemSent: boolean
  abortedLastRun: boolean
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  totalTokensFresh?: boolean
  model?: string | null
  modelProvider?: string | null
  contextTokens?: number | null
  agentId: string
  kind: string // e.g. "direct" — keep loose, union later
}

// ═══════════════════════════════════════════════════
// From: transcript .jsonl files
// Each line is a JSON object with a `type` discriminator.
// ═══════════════════════════════════════════════════

/** Shared fields present on most transcript lines */
interface RawTranscriptBase {
  id: string
  timestamp: number // epoch ms
  parentId?: string
}

export interface RawTranscriptSession extends RawTranscriptBase {
  type: 'session'
  version: string
  cwd: string
  [key: string]: unknown
}

export interface RawTranscriptModelChange extends RawTranscriptBase {
  type: 'model_change'
  provider: string
  modelId: string
  [key: string]: unknown
}

export interface RawTranscriptThinkingLevelChange extends RawTranscriptBase {
  type: 'thinking_level_change'
  thinkingLevel: string
  [key: string]: unknown
}

export interface RawTranscriptCustom extends RawTranscriptBase {
  type: 'custom'
  customType: string
  data: Record<string, unknown>
  [key: string]: unknown
}

export interface RawTranscriptMessage extends RawTranscriptBase {
  type: 'message'
  message: RawMessage
}

export type RawTranscriptLine =
  | RawTranscriptSession
  | RawTranscriptModelChange
  | RawTranscriptThinkingLevelChange
  | RawTranscriptCustom
  | RawTranscriptMessage

// ═══════════════════════════════════════════════════
// Message shapes (inside type:"message" transcript lines)
// ═══════════════════════════════════════════════════

export type RawMessage =
  | RawUserMessage
  | RawAssistantMessage
  | RawToolResultMessage

interface RawMessageBase {
  content: RawContentBlock[]
  timestamp?: number
}

export interface RawUserMessage extends RawMessageBase {
  role: 'user'
}

export interface RawAssistantMessage extends RawMessageBase {
  role: 'assistant'
  api?: string
  provider?: string
  model?: string
  usage?: RawUsage
  stopReason?: string
}

export interface RawToolResultMessage extends RawMessageBase {
  role: 'toolResult'
  toolCallId?: string
  toolName?: string
  isError?: boolean
}

// ═══════════════════════════════════════════════════
// Usage — richer than just token counts on disk
// ═══════════════════════════════════════════════════

export interface RawUsage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens?: number
  cost?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    total?: number
  }
  [key: string]: unknown // future-proof
}

// ═══════════════════════════════════════════════════
// Content blocks (inside message.content arrays)
// ═══════════════════════════════════════════════════

export type RawContentBlock =
  | RawTextBlock
  | RawToolCallBlock
  | RawThinkingBlock

export interface RawTextBlock {
  type: 'text'
  text: string
}

export interface RawToolCallBlock {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, unknown>
  partialJson?: string // streaming snapshot
  [key: string]: unknown
}

export interface RawThinkingBlock {
  type: 'thinking'
  [key: string]: unknown // intentionally loose
}
