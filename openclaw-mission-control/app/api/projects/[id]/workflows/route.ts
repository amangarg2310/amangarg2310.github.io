import { store } from '@/lib/store'
import { WORKFLOW_CHAINS, type WorkflowInstance } from '@/lib/workflow-chains'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const instances = store.getWorkflowInstances(id)

  return Response.json(instances, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const chainId = body.chain_id as string
  if (!chainId) {
    return Response.json({ error: 'chain_id required' }, {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  const chain = WORKFLOW_CHAINS.find((c) => c.id === chainId)
  if (!chain) {
    return Response.json({ error: 'Unknown chain' }, {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  const now = new Date().toISOString()
  const instance: WorkflowInstance = {
    id: `wf-${Date.now()}`,
    chain_id: chainId,
    project_id: id,
    current_step: 0,
    status: 'running',
    step_run_ids: chain.steps.map(() => null),
    created_at: now,
    updated_at: now,
  }

  store.upsertWorkflowInstance(instance)

  return Response.json(instance, {
    status: 201,
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
