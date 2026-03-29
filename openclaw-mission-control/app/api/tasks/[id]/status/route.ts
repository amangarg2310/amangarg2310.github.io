import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/tasks/[id]/status
 *
 * Update a task's status. Used by the boards to promote/demote tasks.
 * Body: { status: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { status } = body

  if (!status) {
    return Response.json({ error: 'status is required' }, { status: 400 })
  }

  const updated = store.updateTaskStatus(id, status)
  if (!updated) {
    return Response.json({ error: 'Task not found' }, { status: 404 })
  }

  const task = store.getTask(id)
  return Response.json(task)
}
