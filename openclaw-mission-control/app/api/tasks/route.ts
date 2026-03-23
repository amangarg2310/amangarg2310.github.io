import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tasks = store.getTasks()
  return Response.json(tasks, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
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
