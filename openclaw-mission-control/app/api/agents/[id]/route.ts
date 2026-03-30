import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const agent = store.getAgent(id)

  if (!agent) {
    return Response.json({ error: 'Agent not found' }, {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  return Response.json(agent, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
