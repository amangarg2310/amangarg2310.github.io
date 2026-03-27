import { store } from '@/lib/store'
import type { Project } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const projects = store.getProjects()
  return Response.json(projects, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function POST(request: Request) {
  const body = await request.json() as {
    name: string
    description?: string
    color?: string
    repo_url?: string
    repo_branch?: string
  }

  if (!body.name || typeof body.name !== 'string') {
    return Response.json({ error: 'name is required' }, {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const now = new Date().toISOString()

  const project: Project = {
    id: `proj-${Date.now()}`,
    name: body.name,
    slug,
    description: body.description || '',
    color: body.color || '#3b82f6',
    repo_url: body.repo_url || null,
    repo_branch: body.repo_branch || null,
    created_at: now,
    updated_at: now,
  }

  store.upsertProject(project)

  return Response.json(project, {
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
