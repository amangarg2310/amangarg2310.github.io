import { store } from '@/lib/store'
import { recommendExecution, type TaskLaunchConfig } from '@/lib/task-recommender'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as Partial<TaskLaunchConfig>

  const config: TaskLaunchConfig = {
    project_id: id,
    goal: body.goal || '',
    urgency: body.urgency || 'medium',
    tradeoff: body.tradeoff || 'balanced',
    recurring: body.recurring || false,
    recurrence_cadence: body.recurrence_cadence,
  }

  const agents = store.getAgents()
  const assignments = store.getRoleAssignments(id)

  const recommendation = recommendExecution(config, agents, assignments)

  return Response.json(recommendation, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
