import { store } from '@/lib/store'
import { isSessionActive } from '@/lib/agent-runtime'

export const dynamic = 'force-dynamic'

/**
 * GET /api/conversations/[id]/detail
 *
 * Returns conversation detail with messages from the in-memory store.
 * Session activity is determined by the agent runtime (active SDK queries).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conversation = store.getConversation(id)

  if (!conversation) {
    return Response.json(
      { error: 'Conversation not found' },
      { status: 404, headers: corsHeaders }
    )
  }

  const messages = store.getMessages(id)
  const sessionId = id.startsWith('conv-') ? id.slice(5) : id
  const events = store.getRunEvents(sessionId)
  const isLocked = isSessionActive(id)

  return Response.json(
    {
      conversation,
      messages,
      events,
      pagination: { offset: 0, limit: 0, hasMore: false, totalLinesRead: messages.length },
      session: {
        isLocked,
        agentId: conversation.agent_id,
        sessionId,
      },
    },
    { headers: corsHeaders }
  )
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
