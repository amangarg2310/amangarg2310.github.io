import { NextResponse } from 'next/server'
import { spawnAgentRun, sendMessage } from '@/lib/agent-runtime'
import { store } from '@/lib/store'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat
 *
 * Send a message. If conversation_id is provided, continues that conversation.
 * If project_id + agent_id is provided, starts a new conversation.
 *
 * Body: { message, conversation_id?, project_id?, agent_id?, role? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { message, conversation_id, project_id, agent_id, role } = body

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Continue existing conversation
    if (conversation_id) {
      await sendMessage(conversation_id, message)
      return NextResponse.json({ ok: true, conversation_id })
    }

    // Start new conversation — need project_id and agent_id
    if (!project_id || !agent_id) {
      return NextResponse.json(
        { error: 'Either conversation_id or (project_id + agent_id) is required' },
        { status: 400 }
      )
    }

    // Create a task for this message
    const taskId = `task-${crypto.randomUUID().slice(0, 8)}`
    store.upsertTask({
      id: taskId,
      title: message.slice(0, 100),
      description: message,
      priority: 'medium',
      status: 'queued',
      assigned_agent_id: agent_id,
      created_by: 'user',
      project_id,
      role: role || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Spawn the agent
    const { runId, conversationId } = await spawnAgentRun({
      taskId,
      agentId: agent_id,
      projectId: project_id,
      prompt: message,
      role,
    })

    return NextResponse.json({ ok: true, run_id: runId, conversation_id: conversationId })
  } catch (err) {
    console.error('[api/chat] Error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
