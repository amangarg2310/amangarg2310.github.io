import { store } from '@/lib/store'
import type { RoleAssignment, RoleLane } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const assignments = store.getRoleAssignments(id)
  return Response.json(assignments, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const body = await request.json() as { role: RoleLane; agent_id: string; notes?: string }

  if (!body.role || !body.agent_id) {
    return Response.json({ error: 'role and agent_id are required' }, {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Check if this role is already assigned in this project
  const existing = store.getRoleAssignments(projectId).find((ra) => ra.role === body.role)

  const assignment: RoleAssignment = {
    id: existing?.id || `ra-${Date.now()}`,
    project_id: projectId,
    role: body.role,
    agent_id: body.agent_id,
    notes: body.notes || '',
    created_at: existing?.created_at || new Date().toISOString(),
  }

  store.upsertRoleAssignment(assignment)

  return Response.json(assignment, {
    status: existing ? 200 : 201,
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const url = new URL(request.url)
  const role = url.searchParams.get('role')

  if (!role) {
    return Response.json({ error: 'role query param is required' }, {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  const assignment = store.getRoleAssignments(projectId).find((ra) => ra.role === role)
  if (assignment) {
    store.removeRoleAssignment(assignment.id)
  }

  return Response.json({ ok: true }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
