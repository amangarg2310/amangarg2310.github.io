import { store } from '@/lib/store'
import { ROLE_LANES } from '@/lib/roles'
import { WORKFLOW_CHAINS } from '@/lib/workflow-chains'
import type {
  CommandCenterData,
  RoleSummary,
  BlockerItem,
  NextAction,
  BudgetSummary,
  WorkflowInstanceSummary,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const project = store.getProject(id)

  if (!project) {
    return Response.json({ error: 'Project not found' }, {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  const assignments = store.getRoleAssignments(id)
  const agents = store.getAgents()
  const tasks = store.getTasksByProject(id)
  const runs = store.getRunsByProject(id)
  const automationConfigs = store.getAutomationConfigs(id)
  const workflowInstances = store.getWorkflowInstances(id)
  const activity = store.getRecentActivityByProject(id, 10)
  const usage = store.getDailyUsage()

  // --- Role summaries ---
  const roleSummaries: RoleSummary[] = ROLE_LANES.map((lane) => {
    const assignment = assignments.find((a) => a.role === lane.id)
    const agent = assignment ? agents.find((a) => a.id === assignment.agent_id) : undefined
    const agentRuns = assignment
      ? runs.filter((r) => r.agent_id === assignment.agent_id)
      : []
    const roleAutomations = automationConfigs.filter((ac) => ac.role === lane.id)
    const lastRun = agentRuns
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]

    return {
      role: lane.id,
      agent_id: agent?.id ?? null,
      agent_name: agent?.name ?? null,
      agent_status: agent?.status ?? null,
      taskCount: assignment
        ? tasks.filter((t) => t.assigned_agent_id === assignment.agent_id).length
        : 0,
      activeRunCount: agentRuns.filter((r) => r.status === 'running').length,
      lastActivity: lastRun?.started_at ?? null,
      automationsEnabled: roleAutomations.filter((ac) => ac.enabled).length,
      automationsTotal: lane.suggestedJobs.length,
    }
  })

  // --- Blockers ---
  const blockers: BlockerItem[] = []
  for (const run of runs) {
    if (run.status === 'failed' || run.status === 'stalled' || run.status === 'needs_approval') {
      const agent = agents.find((a) => a.id === run.agent_id)
      blockers.push({
        id: `blocker-${run.id}`,
        type: run.status as BlockerItem['type'],
        title: run.task_title || run.id,
        agent_name: agent?.name || 'Unknown',
        time: run.ended_at || run.started_at,
        run_id: run.id,
      })
    }
  }

  // --- Next actions ---
  const nextActions: NextAction[] = []

  // Unassigned roles
  const unassignedRoles = ROLE_LANES.filter(
    (lane) => !assignments.some((a) => a.role === lane.id)
  )
  for (const role of unassignedRoles) {
    nextActions.push({
      id: `action-assign-${role.id}`,
      type: 'assign_role',
      title: `Assign agent to ${role.label}`,
      description: `The ${role.label} role has no agent. Assign one to unlock ${role.suggestedJobs.length} automations.`,
      priority: 'medium',
    })
  }

  // Pending approvals
  const approvalCount = runs.filter((r) => r.status === 'needs_approval').length
  if (approvalCount > 0) {
    nextActions.push({
      id: 'action-review-approvals',
      type: 'review_approval',
      title: `Review ${approvalCount} pending approval${approvalCount > 1 ? 's' : ''}`,
      description: 'Agent work is waiting for your sign-off before proceeding.',
      priority: 'high',
    })
  }

  // Stalled runs
  const stalledCount = runs.filter((r) => r.status === 'stalled').length
  if (stalledCount > 0) {
    nextActions.push({
      id: 'action-investigate-stalls',
      type: 'investigate_stall',
      title: `Investigate ${stalledCount} stalled run${stalledCount > 1 ? 's' : ''}`,
      description: 'Agents are stuck and may need intervention or unblocking.',
      priority: 'high',
    })
  }

  // Suggest enabling automations for assigned roles with 0 enabled
  for (const summary of roleSummaries) {
    if (summary.agent_id && summary.automationsEnabled === 0 && summary.automationsTotal > 0) {
      const lane = ROLE_LANES.find((l) => l.id === summary.role)
      if (lane) {
        nextActions.push({
          id: `action-enable-auto-${summary.role}`,
          type: 'enable_automation',
          title: `Enable automations for ${lane.label}`,
          description: `${lane.label} has ${summary.automationsTotal} available automations. Enable them to start recurring work.`,
          priority: 'low',
        })
      }
    }
  }

  // --- Budget summary ---
  const todayCost = runs.reduce((sum, r) => sum + r.estimated_cost, 0)
  const today = usage[usage.length - 1]
  const budgetSummary: BudgetSummary = {
    costToday: today?.estimated_cost ?? todayCost,
    costTotal: runs.reduce((sum, r) => sum + r.estimated_cost, 0),
    runsToday: today?.runs ?? runs.filter((r) => r.status === 'running').length,
    dailyTrend: usage.slice(-7).map((d) => d.estimated_cost),
  }

  // --- Automation summary ---
  const automationSummary = {
    enabled: automationConfigs.filter((ac) => ac.enabled).length,
    total: ROLE_LANES.reduce((sum, lane) => sum + lane.suggestedJobs.length, 0),
  }

  // --- Active workflows ---
  const activeWorkflows: WorkflowInstanceSummary[] = workflowInstances
    .filter((wi) => wi.status === 'running' || wi.status === 'waiting')
    .map((wi) => {
      const chain = WORKFLOW_CHAINS.find((c) => c.id === wi.chain_id)
      return {
        id: wi.id,
        chain_name: chain?.name ?? wi.chain_id,
        current_step: wi.current_step,
        total_steps: chain?.steps.length ?? 0,
        status: wi.status,
        updated_at: wi.updated_at,
      }
    })

  const data: CommandCenterData = {
    project,
    focus: project.focus ?? null,
    roleSummaries,
    blockers,
    nextActions,
    budgetSummary,
    recentActivity: activity,
    automationSummary,
    activeWorkflows,
  }

  return Response.json(data, {
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
