import { store } from '@/lib/store'
import type { Task } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const projectId = url.searchParams.get('project_id')

  const tasks = projectId ? store.getTasksByProject(projectId) : store.getTasks()
  return Response.json(tasks, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function POST(request: Request) {
  const body = await request.json()

  const now = new Date().toISOString()
  const task: Task = {
    id: `task-${Date.now()}`,
    title: body.title || body.goal || 'Untitled task',
    description: body.description || body.goal || '',
    priority: body.priority || 'medium',
    status: 'queued',
    assigned_agent_id: body.assigned_agent_id || null,
    created_by: 'dashboard',
    project_id: body.project_id || null,
    role: body.role || null,
    tier: body.tier || null,
    autonomy: body.autonomy || null,
    agent_strategy: body.agent_strategy || null,
    workflow_chain_id: body.workflow_chain_id || null,
    created_at: now,
    updated_at: now,
  }

  store.upsertTask(task)

  return Response.json(task, {
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
