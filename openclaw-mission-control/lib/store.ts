import { Agent, Task, Run, RunEvent, Message, Conversation, DailyUsage, ModelUsage, Project, RoleAssignment, ProjectContext, AutomationConfig } from './types'
import { WORKFLOW_CHAINS, type WorkflowInstance } from './workflow-chains'
import { loadProjectData, saveProjectData } from './project-store'

/**
 * Persistent in-memory data store for Mission Control.
 *
 * Manages all data locally — no external sync dependency.
 * Agents are spawned via the Claude Agent SDK (lib/agent-runtime.ts).
 * Dashboard-owned data (projects, roles, etc.) persists to disk.
 *
 * API routes only read from this store — never from external services.
 * This is a server-only module — never import from client components.
 */

// Use a local state dir for persistence
const stateDir = process.env.MISSION_CONTROL_STATE_DIR || null

class DataStore {
  private _agents: Agent[]
  private _tasks: Task[]
  private _runs: Run[]
  private _runEvents: RunEvent[]
  private _conversations: Conversation[]
  private _messages: Message[]
  private _dailyUsage: DailyUsage[]
  private _modelUsage: ModelUsage[]

  // Dashboard-owned data — NOT touched by replaceAll()
  private _projects: Project[]
  private _roleAssignments: RoleAssignment[]
  private _automationConfigs: AutomationConfig[]
  private _workflowInstances: WorkflowInstance[]

  constructor() {
    // Always start empty — runtime data managed by agent-runtime.ts
    // No demo/mock data seeding.
    this._agents = []
    this._tasks = []
    this._runs = []
    this._runEvents = []
    this._conversations = []
    this._messages = []
    this._dailyUsage = []
    this._modelUsage = []

    // Load dashboard-owned data from disk if available, otherwise start empty
    const diskData = loadProjectData(stateDir)
    if (diskData) {
      this._projects = diskData.projects
      this._roleAssignments = diskData.roleAssignments
      this._automationConfigs = diskData.automationConfigs
      this._workflowInstances = diskData.workflowInstances
    } else {
      this._projects = []
      this._roleAssignments = []
      this._automationConfigs = []
      this._workflowInstances = []
    }
  }

  /**
   * Replace all bridge-sourced store contents atomically. Called by sync.ts.
   * DOES NOT touch _projects or _roleAssignments — those are dashboard-owned.
   */
  replaceAll(data: {
    agents: Agent[]
    tasks: Task[]
    runs: Run[]
    runEvents: RunEvent[]
    conversations: Conversation[]
    messages: Message[]
    dailyUsage: DailyUsage[]
    modelUsage: ModelUsage[]
  }): void {
    this._agents = data.agents
    this._tasks = data.tasks
    this._runs = data.runs
    this._runEvents = data.runEvents
    this._conversations = data.conversations
    this._messages = data.messages
    this._dailyUsage = data.dailyUsage
    this._modelUsage = data.modelUsage
  }

  // --- Agents ---
  getAgents(): Agent[] {
    return this._agents
  }

  getAgent(id: string): Agent | undefined {
    return this._agents.find((a) => a.id === id)
  }

  upsertAgent(agent: Agent): void {
    const idx = this._agents.findIndex((a) => a.id === agent.id)
    if (idx >= 0) this._agents[idx] = agent
    else this._agents.push(agent)
  }

  // --- Tasks ---
  getTasks(): Task[] {
    return this._tasks
  }

  getTask(id: string): Task | undefined {
    return this._tasks.find((t) => t.id === id)
  }

  getTasksByProject(projectId: string): Task[] {
    return this._tasks.filter((t) => t.project_id === projectId)
  }

  upsertTask(task: Task): void {
    const idx = this._tasks.findIndex((t) => t.id === task.id)
    if (idx >= 0) this._tasks[idx] = task
    else this._tasks.push(task)
  }

  updateTaskStatus(id: string, status: Task['status']): boolean {
    const task = this._tasks.find((t) => t.id === id)
    if (!task) return false
    task.status = status
    task.updated_at = new Date().toISOString()
    return true
  }

  // --- Runs ---
  getRuns(): Run[] {
    return this._runs
  }

  getRun(id: string): Run | undefined {
    return this._runs.find((r) => r.id === id)
  }

  getRunsByProject(projectId: string): Run[] {
    return this._runs.filter((r) => r.project_id === projectId)
  }

  getRunEvents(runId: string): RunEvent[] {
    return this._runEvents.filter((e) => e.run_id === runId)
  }

  upsertRun(run: Run): void {
    const idx = this._runs.findIndex((r) => r.id === run.id)
    if (idx >= 0) this._runs[idx] = run
    else this._runs.push(run)
  }

  addRunEvent(event: RunEvent): void {
    this._runEvents.push(event)
  }

  // --- Conversations ---
  getConversations(): Conversation[] {
    return this._conversations
  }

  getConversation(id: string): Conversation | undefined {
    return this._conversations.find((c) => c.id === id)
  }

  getConversationsByProject(projectId: string): Conversation[] {
    return this._conversations.filter((c) => c.project_id === projectId)
  }

  upsertConversation(conversation: Conversation): void {
    const idx = this._conversations.findIndex((c) => c.id === conversation.id)
    if (idx >= 0) this._conversations[idx] = conversation
    else this._conversations.push(conversation)
  }

  getMessages(conversationId: string): Message[] {
    return this._messages.filter((m) => m.conversation_id === conversationId)
  }

  addMessage(message: Message): void {
    this._messages.push(message)
  }

  // --- Usage ---
  getDailyUsage(): DailyUsage[] {
    return this._dailyUsage
  }

  getModelUsage(): ModelUsage[] {
    return this._modelUsage
  }

  // --- Projects (dashboard-owned, persisted to disk) ---
  getProjects(): Project[] {
    return this._projects
  }

  getProject(id: string): Project | undefined {
    return this._projects.find((p) => p.id === id)
  }

  upsertProject(project: Project): void {
    const idx = this._projects.findIndex((p) => p.id === project.id)
    if (idx >= 0) this._projects[idx] = project
    else this._projects.push(project)
    this._persistProjects()
  }

  deleteProject(id: string): boolean {
    const idx = this._projects.findIndex((p) => p.id === id)
    if (idx < 0) return false
    this._projects.splice(idx, 1)
    // Also remove role assignments for this project
    this._roleAssignments = this._roleAssignments.filter((ra) => ra.project_id !== id)
    this._persistProjects()
    return true
  }

  // --- Role Assignments (dashboard-owned, persisted to disk) ---
  getRoleAssignments(projectId?: string): RoleAssignment[] {
    if (projectId) return this._roleAssignments.filter((ra) => ra.project_id === projectId)
    return this._roleAssignments
  }

  upsertRoleAssignment(assignment: RoleAssignment): void {
    const idx = this._roleAssignments.findIndex((ra) => ra.id === assignment.id)
    if (idx >= 0) this._roleAssignments[idx] = assignment
    else this._roleAssignments.push(assignment)
    this._persistProjects()
  }

  removeRoleAssignment(id: string): boolean {
    const idx = this._roleAssignments.findIndex((ra) => ra.id === id)
    if (idx < 0) return false
    this._roleAssignments.splice(idx, 1)
    this._persistProjects()
    return true
  }

  getProjectContext(projectId: string): ProjectContext | null {
    const project = this.getProject(projectId)
    if (!project) return null

    const assignments = this.getRoleAssignments(projectId)
    const tasks = this.getTasksByProject(projectId)
    const runs = this.getRunsByProject(projectId)
    const taskCount = tasks.length
    const activeRunCount = runs.filter((r) => r.status === 'running').length
    const recentConversationCount = this.getConversationsByProject(projectId).length
    const blockedCount = runs.filter((r) => r.status === 'failed' || r.status === 'stalled' || r.status === 'needs_approval').length
    const queuedCount = tasks.filter((t) => t.status === 'queued').length
    const completedCount = tasks.filter((t) => t.status === 'completed').length

    // Most recent run start or end time
    const allTimes = runs
      .flatMap((r) => [r.started_at, r.ended_at])
      .filter(Boolean) as string[]
    const lastActivityAt = allTimes.length > 0
      ? allTimes.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null

    return { project, assignments, taskCount, activeRunCount, recentConversationCount, blockedCount, queuedCount, completedCount, lastActivityAt }
  }

  // --- Activity (computed) ---
  getRecentActivity(limit = 20) {
    type ActivityItem = {
      id: string
      text: string
      time: string
      type: 'started' | 'completed' | 'failed' | 'needs_approval' | 'stalled'
      project_id?: string | null
    }

    const items: ActivityItem[] = []

    for (const run of this._runs) {
      const agent = this._agents.find((a) => a.id === run.agent_id)
      const name = agent?.name || 'Agent'
      const title = run.task_title || run.id

      items.push({
        id: `act-start-${run.id}`,
        text: `${name} started ${title}`,
        time: run.started_at,
        type: 'started',
        project_id: run.project_id,
      })

      if (run.status === 'completed' && run.ended_at) {
        items.push({
          id: `act-end-${run.id}`,
          text: `${name} completed ${title}`,
          time: run.ended_at,
          type: 'completed',
          project_id: run.project_id,
        })
      }
      if (run.status === 'failed' && run.ended_at) {
        items.push({
          id: `act-fail-${run.id}`,
          text: `${name} failed on ${title} — ${run.retry_count} retries exhausted`,
          time: run.ended_at,
          type: 'failed',
          project_id: run.project_id,
        })
      }
      if (run.status === 'needs_approval') {
        items.push({
          id: `act-approval-${run.id}`,
          text: `${name} completed ${title} — awaiting approval`,
          time: run.ended_at || run.started_at,
          type: 'needs_approval',
          project_id: run.project_id,
        })
      }
      if (run.status === 'stalled') {
        items.push({
          id: `act-stall-${run.id}`,
          text: `${name} stalled on ${title}`,
          time: run.started_at,
          type: 'stalled',
          project_id: run.project_id,
        })
      }
    }

    return items
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limit)
  }

  getRecentActivityByProject(projectId: string, limit = 20) {
    return this.getRecentActivity(limit * 2)
      .filter((item) => item.project_id === projectId)
      .slice(0, limit)
  }

  // --- Aggregate helpers ---
  getTodayUsage() {
    const today = this._dailyUsage[this._dailyUsage.length - 1]
    if (!today) return { tokens: 0, cost: 0, runs: 0 }
    return {
      tokens: today.input_tokens + today.output_tokens,
      cost: today.estimated_cost,
      runs: today.runs,
    }
  }

  getActiveRuns(): Run[] {
    return this._runs.filter((r) => r.status === 'running')
  }

  getQueuedTasks(): Task[] {
    return this._tasks.filter((t) => t.status === 'queued')
  }

  getFailedRuns(): Run[] {
    return this._runs.filter((r) => r.status === 'failed')
  }

  getStalledRuns(): Run[] {
    return this._runs.filter((r) => r.status === 'stalled')
  }

  getNeedsApproval(): Task[] {
    return this._tasks.filter((t) => t.status === 'needs_approval')
  }

  getOnlineAgents(): Agent[] {
    return this._agents.filter((a) => a.is_active)
  }

  // --- Automation Configs (dashboard-owned, persisted to disk) ---
  getAutomationConfigs(projectId?: string): AutomationConfig[] {
    if (projectId) return this._automationConfigs.filter((ac) => ac.project_id === projectId)
    return this._automationConfigs
  }

  upsertAutomationConfig(config: AutomationConfig): void {
    const idx = this._automationConfigs.findIndex(
      (ac) => ac.project_id === config.project_id && ac.job_id === config.job_id,
    )
    if (idx >= 0) this._automationConfigs[idx] = config
    else this._automationConfigs.push(config)
    this._persistProjects()
  }

  toggleAutomation(projectId: string, jobId: string, enabled: boolean): boolean {
    const config = this._automationConfigs.find(
      (ac) => ac.project_id === projectId && ac.job_id === jobId,
    )
    if (!config) return false
    config.enabled = enabled
    this._persistProjects()
    return true
  }

  // --- Workflow Instances (dashboard-owned, persisted to disk) ---
  getWorkflowInstances(projectId?: string): WorkflowInstance[] {
    if (projectId) return this._workflowInstances.filter((wi) => wi.project_id === projectId)
    return this._workflowInstances
  }

  getWorkflowInstance(id: string): WorkflowInstance | undefined {
    return this._workflowInstances.find((wi) => wi.id === id)
  }

  upsertWorkflowInstance(instance: WorkflowInstance): void {
    const idx = this._workflowInstances.findIndex((wi) => wi.id === instance.id)
    if (idx >= 0) this._workflowInstances[idx] = instance
    else this._workflowInstances.push(instance)
    this._persistProjects()
  }

  updateWorkflowStatus(instanceId: string, status: WorkflowInstance['status']): WorkflowInstance | null {
    const instance = this._workflowInstances.find((wi) => wi.id === instanceId)
    if (!instance) return null
    instance.status = status
    instance.updated_at = new Date().toISOString()
    this._persistProjects()
    return instance
  }

  advanceWorkflow(instanceId: string, runId: string): WorkflowInstance | null {
    const instance = this._workflowInstances.find((wi) => wi.id === instanceId)
    if (!instance) return null

    // Record the run for the current step
    instance.step_run_ids[instance.current_step] = runId
    instance.current_step += 1
    instance.updated_at = new Date().toISOString()

    // Check if chain is complete
    const chain = WORKFLOW_CHAINS.find((c) => c.id === instance.chain_id)
    if (chain && instance.current_step >= chain.steps.length) {
      instance.status = 'completed'
    } else {
      instance.status = 'waiting' // waiting for next step to start
    }

    this._persistProjects()
    return instance
  }

  // --- Project Focus ---
  updateProjectFocus(projectId: string, summary: string): boolean {
    const project = this._projects.find((p) => p.id === projectId)
    if (!project) return false
    project.focus = { summary, updated_at: new Date().toISOString() }
    project.updated_at = new Date().toISOString()
    this._persistProjects()
    return true
  }

  // --- Project Objective ---
  updateProjectObjective(projectId: string, objective: string): boolean {
    const project = this._projects.find((p) => p.id === projectId)
    if (!project) return false
    project.objective = objective || null
    project.updated_at = new Date().toISOString()
    this._persistProjects()
    return true
  }

  // --- Project Primary Agent ---
  updateProjectPrimaryAgent(projectId: string, agentId: string | null): boolean {
    const project = this._projects.find((p) => p.id === projectId)
    if (!project) return false
    project.primary_agent_id = agentId
    project.updated_at = new Date().toISOString()
    this._persistProjects()
    return true
  }

  // --- Internal ---
  private _persistProjects(): void {
    saveProjectData(stateDir, {
      projects: this._projects,
      roleAssignments: this._roleAssignments,
      automationConfigs: this._automationConfigs,
      workflowInstances: this._workflowInstances,
    })
  }

  /**
   * Bootstrap default project and agent if the store is completely empty.
   * Called once at startup so users can immediately start chatting.
   */
  bootstrap(): void {
    // Only bootstrap if no projects exist
    if (this._projects.length > 0) return

    const now = new Date().toISOString()

    // Default project
    const defaultProject: Project = {
      id: 'proj-default',
      name: 'General',
      slug: 'general',
      description: 'Default project for quick tasks and conversations',
      color: '#3b82f6',
      created_at: now,
      updated_at: now,
    }
    this.upsertProject(defaultProject)

    // Default agent
    const defaultAgent: Agent = {
      id: 'agent-default',
      name: 'Claude',
      slug: 'claude',
      description: 'General-purpose assistant powered by Claude Code SDK',
      system_prompt: 'You are a helpful AI assistant working on startup projects. Be concise and actionable.',
      specialization: 'General',
      default_model: 'anthropic/claude-sonnet-4-6',
      escalation_model: 'anthropic/claude-opus-4-5',
      max_budget_per_run: 5.0,
      allowed_tools: [],
      avatar_color: '#3b82f6',
      is_active: true,
      total_runs: 0,
      created_at: now,
      updated_at: now,
    }
    this.upsertAgent(defaultAgent)

    // Assign agent to project as advisor role
    this.upsertRoleAssignment({
      id: 'ra-default',
      project_id: 'proj-default',
      role: 'advisor',
      agent_id: 'agent-default',
      notes: 'Default agent assignment',
      created_at: now,
    })

    console.log('[store] Bootstrapped default project and agent')
  }
}

// Singleton — survives across API route invocations in dev/prod
const globalForStore = globalThis as unknown as { __dataStore?: DataStore }
export const store = globalForStore.__dataStore ?? new DataStore()
globalForStore.__dataStore = store

// Auto-bootstrap on first load
store.bootstrap()
