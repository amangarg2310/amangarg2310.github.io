#!/usr/bin/env npx tsx
/**
 * Live validation script for the OpenClaw bridge.
 *
 * Run this on a machine where OpenClaw is installed:
 *   npx tsx scripts/validate-bridge.ts
 *
 * Optional env vars:
 *   OPENCLAW_STATE_DIR   — explicit state dir
 *   OPENCLAW_CLI_PATH    — path to openclaw binary
 *   OPENCLAW_PROFILE     — named profile
 *
 * Validates the 4 checks the OpenClaw agent specified:
 *   1. Agents from CLI appear in store as expected
 *   2. Sessions become sane runs/conversations with idle/running/failed
 *   3. Lock-file detection flips active sessions to running
 *   4. Transcript-backed detail returns real messages for at least one session
 */

import { resolveStateDir } from '../lib/bridge/state-resolver'
import { fetchAgents, fetchSessions } from '../lib/bridge/cli'
import { readTranscript, isSessionActive, hasTranscript } from '../lib/bridge/transcript'
import { normalizeAgent, normalizeSession, normalizeTranscriptLines } from '../lib/bridge/normalizer'
import type { Agent } from '../lib/types'

// ─── Helpers ───────────────────────────────────────────────────────

let passed = 0
let failed = 0
let warnings = 0

function pass(label: string, detail?: string) {
  passed++
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(label: string, detail?: string) {
  failed++
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
}

function warn(label: string, detail?: string) {
  warnings++
  console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ''}`)
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`)
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('OpenClaw Bridge — Live Validation')
  console.log('=================================\n')

  // ── Resolve state dir ──
  section('0. State directory resolution')

  let stateDir: string
  try {
    stateDir = resolveStateDir({ mustExist: true })
    pass('State dir found', stateDir)
  } catch (err) {
    fail('State dir not found', (err as Error).message)
    console.log('\n💀 Cannot continue without a state directory. Exiting.')
    process.exit(1)
  }

  // ── Check 1: Agents ──
  section('1. Agents from CLI')

  const cliOpts = {
    cliPath: process.env.OPENCLAW_CLI_PATH,
    profile: process.env.OPENCLAW_PROFILE,
  }

  const rawAgents = await fetchAgents(cliOpts)

  if (!rawAgents) {
    fail('openclaw agents list --json returned null (CLI not found or errored)')
    console.log('\n💀 Cannot continue without agent data. Is openclaw on your PATH?')
    process.exit(1)
  }

  if (rawAgents.length === 0) {
    warn('CLI returned 0 agents — is this expected?')
  } else {
    pass(`CLI returned ${rawAgents.length} agent(s)`)
  }

  const agents: Agent[] = []
  for (const raw of rawAgents) {
    try {
      const normalized = normalizeAgent(raw)
      agents.push(normalized)

      // Validate key fields
      if (!normalized.id) fail(`Agent missing id`, JSON.stringify(raw))
      if (!normalized.name) fail(`Agent ${raw.id} missing name after normalization`)
      if (!normalized.default_model) warn(`Agent ${raw.id} has no model`)
    } catch (err) {
      fail(`Failed to normalize agent ${raw.id}`, (err as Error).message)
    }
  }

  if (agents.length > 0) {
    pass(`Normalized ${agents.length} agent(s)`)
    console.log('    Sample:', JSON.stringify({
      id: agents[0].id,
      name: agents[0].name,
      model: agents[0].default_model,
      specialization: agents[0].specialization,
    }, null, 2).split('\n').join('\n    '))
  }

  const agentMap = new Map(agents.map((a) => [a.id, a]))

  // ── Check 2: Sessions → Runs/Conversations ──
  section('2. Sessions from CLI')

  const rawSessionList = await fetchSessions(cliOpts)

  if (!rawSessionList) {
    fail('openclaw sessions --json returned null')
    console.log('\n💀 Cannot continue without session data.')
    process.exit(1)
  }

  const rawSessions = rawSessionList.sessions
  pass(`CLI returned ${rawSessions.length} session(s)`)

  if (rawSessions.length > 0) {
    console.log(`    Path: ${rawSessionList.path}`)
    console.log(`    Active minutes: ${rawSessionList.activeMinutes}`)
  }

  const statusCounts = { running: 0, failed: 0, idle: 0, other: 0 }
  const lockChecks: Array<{ sessionId: string; agentId: string; isLocked: boolean }> = []

  for (const raw of rawSessions) {
    const locked = isSessionActive(stateDir, raw.agentId, raw.sessionId)
    lockChecks.push({ sessionId: raw.sessionId, agentId: raw.agentId, isLocked: locked })

    try {
      const { run, conversation } = normalizeSession(raw, agentMap, locked)

      if (run.status === 'running') statusCounts.running++
      else if (run.status === 'failed') statusCounts.failed++
      else if (run.status === 'idle') statusCounts.idle++
      else statusCounts.other++

      // Sanity checks
      if (!run.id) fail(`Session ${raw.sessionId}: run missing id`)
      if (!run.agent_id) warn(`Session ${raw.sessionId}: run missing agent_id`)
      if (!conversation.id) fail(`Session ${raw.sessionId}: conversation missing id`)
    } catch (err) {
      fail(`Failed to normalize session ${raw.sessionId}`, (err as Error).message)
    }
  }

  pass(`Status distribution: ${statusCounts.running} running, ${statusCounts.failed} failed, ${statusCounts.idle} idle, ${statusCounts.other} other`)

  if (statusCounts.running === 0 && statusCounts.idle === 0 && statusCounts.failed === 0) {
    warn('All sessions normalized to "other" — status derivation may need review')
  }

  // ── Check 3: Lock-file detection ──
  section('3. Lock-file detection')

  const lockedSessions = lockChecks.filter((s) => s.isLocked)
  const unlockedSessions = lockChecks.filter((s) => !s.isLocked)

  if (lockedSessions.length > 0) {
    pass(`${lockedSessions.length} session(s) have lock files (active)`)
    for (const s of lockedSessions.slice(0, 3)) {
      console.log(`    🔒 ${s.agentId}/${s.sessionId}`)
    }
  } else {
    warn('No sessions currently locked — if you have an active session, this may indicate a path resolution issue')
  }

  if (unlockedSessions.length > 0) {
    pass(`${unlockedSessions.length} session(s) have no lock file (idle/completed)`)
  }

  // Verify that locked sessions → running in normalized output
  for (const s of lockedSessions) {
    const raw = rawSessions.find((r) => r.sessionId === s.sessionId)
    if (raw) {
      const { run } = normalizeSession(raw, agentMap, true)
      if (run.status === 'running') {
        pass(`Locked session ${s.sessionId.slice(0, 8)}... correctly maps to 'running'`)
      } else {
        fail(`Locked session ${s.sessionId.slice(0, 8)}... mapped to '${run.status}' instead of 'running'`)
      }
    }
  }

  // ── Check 4: Transcript-backed detail ──
  section('4. Transcript-backed conversation detail')

  // Try to find sessions with transcripts
  const sessionsWithTranscripts: typeof lockChecks = []
  for (const s of lockChecks) {
    if (hasTranscript(stateDir, s.agentId, s.sessionId)) {
      sessionsWithTranscripts.push(s)
    }
  }

  if (sessionsWithTranscripts.length === 0) {
    warn('No transcript .jsonl files found for any session')
    warn(`Expected at: ${stateDir}/agents/<agentId>/sessions/<sessionId>.jsonl`)
  } else {
    pass(`Found ${sessionsWithTranscripts.length} session(s) with transcript files`)
  }

  // Test one locked (active) session if available
  const activeSample = sessionsWithTranscripts.find((s) => s.isLocked)
  if (activeSample) {
    await validateTranscript(stateDir, activeSample, 'active')
  } else {
    warn('No active session with transcript to test')
  }

  // Test one unlocked (older) session
  const olderSample = sessionsWithTranscripts.find((s) => !s.isLocked)
  if (olderSample) {
    await validateTranscript(stateDir, olderSample, 'older')
  } else {
    warn('No older (idle) session with transcript to test')
  }

  // ── Summary ──
  section('Summary')
  console.log(`  ${passed} passed, ${failed} failed, ${warnings} warnings`)
  console.log()

  if (failed > 0) {
    console.log('🔴 Validation FAILED — review errors above.')
    process.exit(1)
  } else if (warnings > 0) {
    console.log('🟡 Validation PASSED with warnings — review above.')
  } else {
    console.log('🟢 Validation PASSED — bridge is working correctly.')
  }
}

async function validateTranscript(
  stateDir: string,
  session: { sessionId: string; agentId: string; isLocked: boolean },
  label: string
) {
  console.log(`\n  Testing ${label} session: ${session.agentId}/${session.sessionId.slice(0, 8)}...`)

  // Read first page
  const result = await readTranscript(stateDir, session.agentId, session.sessionId, {
    limit: 50,
  })

  if (!result) {
    fail(`readTranscript returned null for ${label} session`)
    return
  }

  pass(`Read ${result.lines.length} lines (${result.totalLinesRead} total on disk)`)

  if (result.isLocked !== session.isLocked) {
    fail(`Lock status mismatch: expected ${session.isLocked}, got ${result.isLocked}`)
  } else {
    pass(`Lock status consistent: ${result.isLocked ? 'locked' : 'unlocked'}`)
  }

  // Count line types
  const typeCounts: Record<string, number> = {}
  for (const line of result.lines) {
    typeCounts[line.type] = (typeCounts[line.type] || 0) + 1
  }
  console.log(`    Line types: ${JSON.stringify(typeCounts)}`)

  // Normalize
  const { messages, events } = normalizeTranscriptLines(result.lines, session.sessionId)

  if (messages.length > 0) {
    pass(`Normalized ${messages.length} message(s)`)

    // Check roles
    const roleCounts: Record<string, number> = {}
    for (const m of messages) {
      roleCounts[m.role] = (roleCounts[m.role] || 0) + 1
    }
    console.log(`    Roles: ${JSON.stringify(roleCounts)}`)

    // Spot-check first message
    const first = messages[0]
    if (!first.id) fail('First message missing id')
    if (!first.conversation_id) fail('First message missing conversation_id')
    if (!first.created_at) fail('First message missing created_at')
    if (first.content || first.tool_calls) {
      pass('First message has content or tool_calls')
    } else {
      warn('First message has neither content nor tool_calls')
    }
  } else {
    warn(`No messages normalized from ${result.lines.length} transcript lines`)
  }

  if (events.length > 0) {
    pass(`Normalized ${events.length} event(s)`)
  }

  // Test pagination
  if (result.hasMore) {
    const page2 = await readTranscript(stateDir, session.agentId, session.sessionId, {
      offset: 50,
      limit: 10,
    })
    if (page2 && page2.lines.length > 0) {
      pass(`Pagination works: page 2 returned ${page2.lines.length} lines`)
    } else {
      warn('Pagination returned empty page 2 despite hasMore=true')
    }
  }

  // Test type filter
  const messagesOnly = await readTranscript(stateDir, session.agentId, session.sessionId, {
    limit: 10,
    typeFilter: ['message'],
  })
  if (messagesOnly && messagesOnly.lines.every((l) => l.type === 'message')) {
    pass(`Type filter works: ${messagesOnly.lines.length} message-only lines`)
  } else if (messagesOnly && messagesOnly.lines.length === 0) {
    warn('Type filter returned 0 message lines')
  } else {
    fail('Type filter returned non-message lines')
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
