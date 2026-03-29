import { store } from '@/lib/store'
import type { Project, Agent, RoleAssignment } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PRESET_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

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
    objective?: string
    primary_agent_id?: string
  }

  if (!body.name || typeof body.name !== 'string') {
    return Response.json({ error: 'name is required' }, {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const now = new Date().toISOString()
  const projectId = `proj-${Date.now()}`
  const agentId = `agent-${Date.now()}`

  // Auto-pick a color by cycling through presets based on existing project count
  const existingProjects = store.getProjects()
  const autoColor = PRESET_COLORS[existingProjects.length % PRESET_COLORS.length]

  // Create the primary agent automatically
  const agent: Agent = {
    id: agentId,
    name: `${body.name} Agent`,
    slug: `${slug}-agent`,
    description: `Primary agent for ${body.name}`,
    system_prompt: `You are the primary agent for the ${body.name} project. Be concise and actionable.`,
    specialization: 'General',
    default_model: 'anthropic/claude-sonnet-4-6',
    escalation_model: 'anthropic/claude-sonnet-4-6',
    max_budget_per_run: 5.0,
    allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebFetch', 'WebSearch'],
    is_active: true,
    avatar_color: body.color || autoColor,
    project_id: projectId,
    project_name: body.name,
    designation: 'primary',
    created_at: now,
    updated_at: now,
  }

  store.upsertAgent(agent)

  const project: Project = {
    id: projectId,
    name: body.name,
    slug,
    description: body.description || '',
    color: body.color || autoColor,
    objective: body.objective || null,
    primary_agent_id: agentId,
    repo_url: body.repo_url || null,
    repo_branch: body.repo_branch || null,
    created_at: now,
    updated_at: now,
  }

  store.upsertProject(project)

  // Auto-assign the primary agent to the advisor role
  const roleAssignment: RoleAssignment = {
    id: `ra-${Date.now()}`,
    project_id: projectId,
    role: 'advisor',
    agent_id: agentId,
    notes: 'Auto-assigned primary agent',
    created_at: now,
  }

  store.upsertRoleAssignment(roleAssignment)

  return Response.json({ ...project, agent }, {
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
