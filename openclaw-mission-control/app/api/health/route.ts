import { getSyncStatus } from '@/lib/sync'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sync = getSyncStatus()

  return Response.json({
    status: 'ok',
    mode: sync.mode,
    sync,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}
