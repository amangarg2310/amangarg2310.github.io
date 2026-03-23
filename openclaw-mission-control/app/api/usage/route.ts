import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const daily = store.getDailyUsage()
  const models = store.getModelUsage()

  return Response.json(
    { daily, models },
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
