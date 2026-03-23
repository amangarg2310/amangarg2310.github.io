import { store } from '@/lib/store'
import { readTranscript, normalizeTranscriptLines, resolveStateDir } from '@/lib/bridge'

export const dynamic = 'force-dynamic'

/**
 * GET /api/conversations/[id]/detail
 *
 * On-demand conversation detail backed by transcript .jsonl files.
 *
 * Query params:
 *   offset  — skip this many transcript lines (default: 0)
 *   limit   — max lines to return (default: 100, 0 = unlimited)
 *   types   — comma-separated type filter (e.g. "message" or "message,model_change")
 *
 * Response:
 *   {
 *     conversation: Conversation
 *     messages: Message[]
 *     events: RunEvent[]
 *     pagination: { offset, limit, hasMore, totalLinesRead }
 *     session: { isLocked, agentId, sessionId }
 *   }
 *
 * The conversation ID convention is "conv-<sessionId>".
 * The agentId is looked up from the corresponding run in the store.
 *
 * Falls back to store-only data (mock/sync) if transcript is unavailable.
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

  // Extract sessionId from conversation ID ("conv-<sessionId>")
  const sessionId = id.startsWith('conv-') ? id.slice(5) : id

  // Find the corresponding run to get agentId
  const run = store.getRun(sessionId)
  const agentId = run?.agent_id

  if (!agentId) {
    // No run found — fall back to store-only messages
    const messages = store.getMessages(id)
    const events = store.getRunEvents(sessionId)
    return Response.json(
      {
        conversation,
        messages,
        events,
        pagination: { offset: 0, limit: 0, hasMore: false, totalLinesRead: 0 },
        session: { isLocked: false, agentId: null, sessionId },
      },
      { headers: corsHeaders }
    )
  }

  // Parse query params
  const url = new URL(request.url)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const limit = parseInt(url.searchParams.get('limit') || '100', 10)
  const typesParam = url.searchParams.get('types')
  const typeFilter = typesParam
    ? (typesParam.split(',').map((t) => t.trim()) as Array<'session' | 'message' | 'model_change' | 'thinking_level_change' | 'custom'>)
    : undefined

  // Read transcript from disk
  let stateDir: string
  try {
    stateDir = resolveStateDir({
      explicitPath: process.env.OPENCLAW_STATE_DIR,
      mustExist: false,
    })
  } catch {
    // State dir resolution failed — fall back to store
    const messages = store.getMessages(id)
    const events = store.getRunEvents(sessionId)
    return Response.json(
      {
        conversation,
        messages,
        events,
        pagination: { offset: 0, limit: 0, hasMore: false, totalLinesRead: 0 },
        session: { isLocked: false, agentId, sessionId },
      },
      { headers: corsHeaders }
    )
  }

  const result = await readTranscript(stateDir, agentId, sessionId, {
    offset,
    limit: limit || undefined,
    typeFilter,
  })

  if (!result) {
    // Transcript file doesn't exist — fall back to store
    const messages = store.getMessages(id)
    const events = store.getRunEvents(sessionId)
    return Response.json(
      {
        conversation,
        messages,
        events,
        pagination: { offset, limit, hasMore: false, totalLinesRead: 0 },
        session: { isLocked: false, agentId, sessionId },
      },
      { headers: corsHeaders }
    )
  }

  // Normalize transcript lines into Messages + RunEvents
  const { messages, events } = normalizeTranscriptLines(result.lines, sessionId)

  return Response.json(
    {
      conversation,
      messages,
      events,
      pagination: {
        offset,
        limit,
        hasMore: result.hasMore,
        totalLinesRead: result.totalLinesRead,
      },
      session: {
        isLocked: result.isLocked,
        agentId,
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
