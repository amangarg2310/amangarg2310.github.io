import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const run = store.getRun(id)
  if (!run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  // Try to abort via agent-runtime if active
  try {
    const { stopRun } = await import('@/lib/agent-runtime')
    stopRun(id)
  } catch {
    // SDK not available — just update status directly
  }

  // Update run status
  run.status = 'failed'
  run.ended_at = new Date().toISOString()
  store.upsertRun(run)

  // Update associated task
  if (run.task_id) {
    store.updateTaskStatus(run.task_id, 'failed')
  }

  return Response.json({ ok: true, run })
}
