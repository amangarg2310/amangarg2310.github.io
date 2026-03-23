/**
 * Fixture-based integration tests for the OpenClaw bridge.
 *
 * Run:  npx tsx --test tests/bridge.test.ts
 *
 * Uses node:test + node:assert (zero dependencies).
 * Tests all bridge layers against fixture data in tests/fixtures/.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

import type { RawAgent, RawSessionList } from '../lib/bridge/raw-types'
import { resolveStateDir } from '../lib/bridge/state-resolver'
import { readTranscript, isSessionActive, hasTranscript } from '../lib/bridge/transcript'
import {
  normalizeAgent,
  normalizeSession,
  normalizeTranscriptLines,
  computeUsage,
} from '../lib/bridge/normalizer'

// ─── Fixture loading ───────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, 'fixtures')

function loadFixture<T>(name: string): T {
  const raw = readFileSync(join(FIXTURES_DIR, name), 'utf-8')
  return JSON.parse(raw) as T
}

// ─── Temp state dir for transcript tests ───────────────────────────

let tempStateDir: string

function setupTempState() {
  tempStateDir = join(tmpdir(), `openclaw-test-${Date.now()}`)
  // Create per-agent session directory
  const sessionsDir = join(tempStateDir, 'agents', 'main', 'sessions')
  mkdirSync(sessionsDir, { recursive: true })

  // Copy transcript fixture
  copyFileSync(
    join(FIXTURES_DIR, 'transcript.jsonl'),
    join(sessionsDir, 'fe2c7af8-b34c-4c49-b340-a9156aa5b402.jsonl')
  )

  // Create a lock file for the "active" session
  writeFileSync(
    join(sessionsDir, 'fe2c7af8-b34c-4c49-b340-a9156aa5b402.jsonl.lock'),
    ''
  )

  // Create an empty transcript for the aborted session (no lock)
  writeFileSync(
    join(sessionsDir, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl'),
    '{"type":"session","id":"s1","timestamp":1711196400000,"version":"0.9.2","cwd":"/tmp"}\n'
  )
}

function teardownTempState() {
  if (tempStateDir && existsSync(tempStateDir)) {
    rmSync(tempStateDir, { recursive: true, force: true })
  }
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('State resolver', () => {
  it('resolves explicit path', () => {
    const dir = resolveStateDir({ explicitPath: '/tmp/test-openclaw' })
    assert.equal(dir, '/tmp/test-openclaw')
  })

  it('throws on mustExist with nonexistent path', () => {
    assert.throws(
      () => resolveStateDir({ explicitPath: '/nonexistent/path', mustExist: true }),
      /not found/
    )
  })

  it('resolves from OPENCLAW_STATE_DIR env', () => {
    const prev = process.env.OPENCLAW_STATE_DIR
    process.env.OPENCLAW_STATE_DIR = '/tmp/env-test-openclaw'
    try {
      const dir = resolveStateDir()
      assert.equal(dir, '/tmp/env-test-openclaw')
    } finally {
      if (prev === undefined) delete process.env.OPENCLAW_STATE_DIR
      else process.env.OPENCLAW_STATE_DIR = prev
    }
  })
})

describe('Agent normalization', () => {
  const rawAgents = loadFixture<RawAgent[]>('agents.json')

  it('normalizes all agents without throwing', () => {
    const agents = rawAgents.map(normalizeAgent)
    assert.equal(agents.length, 2)
  })

  it('derives name from id', () => {
    const agent = normalizeAgent(rawAgents[0])
    assert.equal(agent.id, 'main')
    assert.equal(agent.name, 'Main')
  })

  it('preserves model', () => {
    const agent = normalizeAgent(rawAgents[0])
    assert.equal(agent.default_model, 'anthropic/claude-3.5-sonnet')
  })

  it('maps routes to specialization', () => {
    const agent = normalizeAgent(rawAgents[0])
    assert.equal(agent.specialization, 'telegram:direct, http:webhook')
  })

  it('maps bindings to total_runs', () => {
    const agent = normalizeAgent(rawAgents[0])
    assert.equal(agent.total_runs, 3)
  })

  it('handles agent with no routes', () => {
    const noRoutes: RawAgent = { ...rawAgents[1], routes: [] }
    const agent = normalizeAgent(noRoutes)
    assert.equal(agent.specialization, 'General')
  })

  it('generates deterministic colors', () => {
    const a1 = normalizeAgent(rawAgents[0])
    const a2 = normalizeAgent(rawAgents[0])
    assert.equal(a1.avatar_color, a2.avatar_color)
  })
})

describe('Session normalization', () => {
  const rawAgents = loadFixture<RawAgent[]>('agents.json')
  const rawSessionList = loadFixture<RawSessionList>('sessions.json')
  const agentMap = new Map(rawAgents.map(normalizeAgent).map((a) => [a.id, a]))

  it('normalizes session list metadata', () => {
    assert.equal(rawSessionList.sessions.length, 3)
    assert.equal(rawSessionList.count, 3)
  })

  it('maps locked session to running', () => {
    const { run } = normalizeSession(rawSessionList.sessions[0], agentMap, true)
    assert.equal(run.status, 'running')
    assert.equal(run.ended_at, null)
  })

  it('maps aborted session to failed', () => {
    const { run } = normalizeSession(rawSessionList.sessions[1], agentMap, false)
    assert.equal(run.status, 'failed')
  })

  it('maps unknown session to idle (not completed)', () => {
    // Session 3 has no abortedLastRun, no lock → should be idle
    const { run } = normalizeSession(rawSessionList.sessions[2], agentMap, false)
    assert.equal(run.status, 'idle')
    assert.notEqual(run.status, 'completed', 'Must not default to completed')
  })

  it('handles missing token counts gracefully', () => {
    // Session 3 has no inputTokens/outputTokens
    const { run } = normalizeSession(rawSessionList.sessions[2], agentMap, false)
    assert.equal(run.input_tokens, 0)
    assert.equal(run.output_tokens, 0)
  })

  it('derives session title from key', () => {
    const { run } = normalizeSession(rawSessionList.sessions[0], agentMap, false)
    assert.equal(run.task_title, 'telegram:direct:6966123628')
  })

  it('maps conversation correctly', () => {
    const { conversation } = normalizeSession(rawSessionList.sessions[0], agentMap, true)
    assert.equal(conversation.status, 'active')
    assert.ok(conversation.id.startsWith('conv-'))
  })

  it('conversation unlocked maps to idle', () => {
    const { conversation } = normalizeSession(rawSessionList.sessions[1], agentMap, false)
    assert.equal(conversation.status, 'idle')
  })
})

describe('Transcript reader', () => {
  before(() => setupTempState())
  after(() => teardownTempState())

  it('reads transcript with all lines', async () => {
    const result = await readTranscript(tempStateDir, 'main', 'fe2c7af8-b34c-4c49-b340-a9156aa5b402')
    assert.ok(result)
    assert.equal(result.lines.length, 12)
    assert.equal(result.isLocked, true)
    assert.equal(result.hasMore, false)
  })

  it('detects lock file correctly', () => {
    assert.equal(isSessionActive(tempStateDir, 'main', 'fe2c7af8-b34c-4c49-b340-a9156aa5b402'), true)
    assert.equal(isSessionActive(tempStateDir, 'main', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'), false)
  })

  it('detects transcript existence', () => {
    assert.equal(hasTranscript(tempStateDir, 'main', 'fe2c7af8-b34c-4c49-b340-a9156aa5b402'), true)
    assert.equal(hasTranscript(tempStateDir, 'main', 'deadbeef-cafe-4000-8000-123456789abc'), false)
  })

  it('paginates with offset and limit', async () => {
    const page1 = await readTranscript(tempStateDir, 'main', 'fe2c7af8-b34c-4c49-b340-a9156aa5b402', {
      limit: 3,
    })
    assert.ok(page1)
    assert.equal(page1.lines.length, 3)
    assert.equal(page1.hasMore, true)

    const page2 = await readTranscript(tempStateDir, 'main', 'fe2c7af8-b34c-4c49-b340-a9156aa5b402', {
      offset: 3,
      limit: 3,
    })
    assert.ok(page2)
    assert.equal(page2.lines.length, 3)
    assert.equal(page2.hasMore, true)

    // IDs should not overlap
    const ids1 = new Set(page1.lines.map((l) => l.id))
    const ids2 = new Set(page2.lines.map((l) => l.id))
    for (const id of ids2) {
      assert.ok(!ids1.has(id), `Overlap: ${id} appears in both pages`)
    }
  })

  it('filters by type', async () => {
    const result = await readTranscript(tempStateDir, 'main', 'fe2c7af8-b34c-4c49-b340-a9156aa5b402', {
      typeFilter: ['message'],
    })
    assert.ok(result)
    assert.ok(result.lines.length > 0)
    for (const line of result.lines) {
      assert.equal(line.type, 'message')
    }
  })

  it('returns null for nonexistent session', async () => {
    const result = await readTranscript(tempStateDir, 'main', 'nonexistent-session-id')
    assert.equal(result, null)
  })
})

describe('Transcript normalization', () => {
  let lines: Awaited<ReturnType<typeof readTranscript>>

  before(async () => {
    setupTempState()
    lines = await readTranscript(tempStateDir, 'main', 'fe2c7af8-b34c-4c49-b340-a9156aa5b402')
  })

  after(() => teardownTempState())

  it('produces messages and events', () => {
    assert.ok(lines)
    const { messages, events } = normalizeTranscriptLines(lines.lines, 'fe2c7af8-b34c-4c49-b340-a9156aa5b402')

    assert.ok(messages.length > 0, 'Should produce messages')
    assert.ok(events.length > 0, 'Should produce events')
  })

  it('normalizes user messages', () => {
    assert.ok(lines)
    const { messages } = normalizeTranscriptLines(lines.lines, 'test-session')
    const userMsgs = messages.filter((m) => m.role === 'user')

    assert.ok(userMsgs.length > 0)
    assert.ok(userMsgs[0].content.includes('Deploy the staging'))
  })

  it('normalizes assistant messages with usage', () => {
    assert.ok(lines)
    const { messages } = normalizeTranscriptLines(lines.lines, 'test-session')
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')

    assert.ok(assistantMsgs.length > 0)

    // At least one should have cost data from usage
    const withCost = assistantMsgs.filter((m) => m.estimated_cost !== null)
    assert.ok(withCost.length > 0, 'At least one assistant message should have cost')
  })

  it('normalizes tool results', () => {
    assert.ok(lines)
    const { messages } = normalizeTranscriptLines(lines.lines, 'test-session')
    const toolMsgs = messages.filter((m) => m.role === 'tool')

    assert.ok(toolMsgs.length > 0)
    assert.ok(toolMsgs[0].tool_calls)
    assert.equal(toolMsgs[0].tool_calls![0].name, 'bash')
  })

  it('extracts tool calls from assistant messages', () => {
    assert.ok(lines)
    const { messages } = normalizeTranscriptLines(lines.lines, 'test-session')
    const withToolCalls = messages.filter((m) => m.role === 'assistant' && m.tool_calls)

    assert.ok(withToolCalls.length > 0)
    assert.equal(withToolCalls[0].tool_calls![0].name, 'bash')
    assert.ok(withToolCalls[0].tool_calls![0].input.includes('kubectl'))
  })

  it('creates events for non-message lines', () => {
    assert.ok(lines)
    const { events } = normalizeTranscriptLines(lines.lines, 'test-session')

    const sessionEvents = events.filter((e) => e.event_type === 'started')
    assert.ok(sessionEvents.length > 0, 'Should have session start event')

    const modelEvents = events.filter((e) => e.summary.includes('Model changed'))
    assert.ok(modelEvents.length > 0, 'Should have model change event')

    const thinkingEvents = events.filter((e) => e.summary.includes('Thinking level'))
    assert.ok(thinkingEvents.length > 0, 'Should have thinking level event')
  })

  it('creates events for custom transcript lines', () => {
    assert.ok(lines)
    const { events } = normalizeTranscriptLines(lines.lines, 'test-session')

    const customEvents = events.filter((e) => e.summary.includes('session_summary'))
    assert.ok(customEvents.length > 0, 'Should have custom event')
  })

  it('conversation_id is correctly derived', () => {
    assert.ok(lines)
    const { messages } = normalizeTranscriptLines(lines.lines, 'my-session-id')
    for (const m of messages) {
      assert.equal(m.conversation_id, 'conv-my-session-id')
    }
  })
})

describe('Usage aggregation', () => {
  const rawAgents = loadFixture<RawAgent[]>('agents.json')
  const rawSessionList = loadFixture<RawSessionList>('sessions.json')
  const agentMap = new Map(rawAgents.map(normalizeAgent).map((a) => [a.id, a]))

  it('computes daily and model usage', () => {
    const runs = rawSessionList.sessions.map((s) =>
      normalizeSession(s, agentMap, false).run
    )
    const { daily, models } = computeUsage(runs)

    assert.ok(daily.length > 0, 'Should have daily usage')
    assert.ok(models.length > 0, 'Should have model usage')
  })

  it('model percentages sum to ~100', () => {
    const runs = rawSessionList.sessions.map((s) =>
      normalizeSession(s, agentMap, false).run
    )
    const { models } = computeUsage(runs)

    const totalPct = models.reduce((s, m) => s + m.percentage, 0)
    assert.ok(totalPct >= 99 && totalPct <= 101, `Percentages sum to ${totalPct}`)
  })

  it('handles empty runs', () => {
    const { daily, models } = computeUsage([])
    assert.equal(daily.length, 0)
    assert.equal(models.length, 0)
  })
})
