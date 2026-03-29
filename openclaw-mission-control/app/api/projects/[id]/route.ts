import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const context = store.getProjectContext(id)

  if (!context) {
    return Response.json({ error: 'Project not found' }, {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  return Response.json(context, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (body.focus !== undefined) {
    const ok = store.updateProjectFocus(id, body.focus)
    if (!ok) {
      return Response.json({ error: 'Project not found' }, {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
  }

  if (body.objective !== undefined) {
    store.updateProjectObjective(id, body.objective)
  }

  if (body.primary_agent_id !== undefined) {
    store.updateProjectPrimaryAgent(id, body.primary_agent_id)
  }

  const context = store.getProjectContext(id)
  return Response.json(context, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deleted = store.deleteProject(id)

  if (!deleted) {
    return Response.json({ error: 'Project not found' }, {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  return Response.json({ ok: true }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
