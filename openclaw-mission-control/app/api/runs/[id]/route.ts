import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const run = store.getRun(id)

  if (!run) {
    return Response.json(
      { error: 'Run not found' },
      { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }

  const events = store.getRunEvents(id)

  return Response.json(
    { run, events },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  )
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
