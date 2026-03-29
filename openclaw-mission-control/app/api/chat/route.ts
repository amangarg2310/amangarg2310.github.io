import { NextResponse } from 'next/server'
import { store } from '@/lib/store'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat
 *
 * Conversational endpoint — works like Claude Code.
 * Creates/continues conversations. Does NOT auto-create tasks.
 * Tasks are created by the agent when it identifies actionable work.
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
      const { sendMessage } = await import('@/lib/agent-runtime')
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

    // Create a new conversation — NO task, just a conversation
    const conversationId = `conv-${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()

    store.upsertConversation({
      id: conversationId,
      agent_id,
      title: message.slice(0, 80),
      task_id: null,
      status: 'active',
      message_count: 1,
      total_cost: 0,
      last_message_at: now,
      project_id,
    })

    // Store the user's message
    store.addMessage({
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      conversation_id: conversationId,
      role: 'user',
      content: message,
      agent_id: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      estimated_cost: null,
      created_at: now,
    })

    // Start the agent conversation in the background
    try {
      const { startConversation } = await import('@/lib/agent-runtime')
      startConversation({
        conversationId,
        agentId: agent_id,
        projectId: project_id,
        prompt: message,
        role,
      })
    } catch (err) {
      // SDK not available — add a system message explaining
      store.addMessage({
        id: `msg-${crypto.randomUUID().slice(0, 8)}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: `I'm not able to respond right now. The Claude Code SDK needs to be installed and you need to be logged in via \`claude login\`.\n\nTo fix this:\n1. Run \`npm install @anthropic-ai/claude-code\`\n2. Run \`claude login\` in your terminal\n3. Restart the dev server`,
        agent_id,
        model: null,
        input_tokens: null,
        output_tokens: null,
        estimated_cost: null,
        created_at: new Date().toISOString(),
      })
      console.error('[api/chat] SDK not available:', (err as Error).message)
    }

    return NextResponse.json({ ok: true, conversation_id: conversationId })
  } catch (err) {
    console.error('[api/chat] Error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
