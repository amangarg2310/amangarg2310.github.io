import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const configs = store.getAutomationConfigs(id)

  return Response.json(configs, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (!body.job_id || !body.role) {
    return Response.json({ error: 'job_id and role required' }, {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  store.upsertAutomationConfig({
    project_id: id,
    job_id: body.job_id,
    role: body.role,
    enabled: body.enabled ?? false,
    cadence: body.cadence ?? 'weekly',
    last_run_at: body.last_run_at ?? null,
    next_run_at: body.next_run_at ?? null,
  })

  return Response.json({ ok: true }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
