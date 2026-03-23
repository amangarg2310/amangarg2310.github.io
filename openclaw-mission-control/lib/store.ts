import { Agent, Task, Run, RunEvent, Message, Conversation, DailyUsage, ModelUsage } from './types'
import {
  agents as mockAgents,
  tasks as mockTasks,
  runs as mockRuns,
  runEvents as mockRunEvents,
  conversations as mockConversations,
  messages as mockMessages,
  dailyUsage as mockDailyUsage,
  modelUsage as mockModelUsage,
} from './mock-data'

/**
 * Persistent in-memory data store for the control plane.
 *
 * Mode selection:
 *  - Demo mode (no OPENCLAW_RUNTIME_URL): seeds with mock data
 *  - Live mode (OPENCLAW_RUNTIME_URL set): starts empty, hydrated by sync.ts
 *
 * The sync layer calls replaceAll() to swap in normalized runtime data.
 * API routes only read from this store — never from the runtime directly.
 *
 * This is a server-only module — never import from client components.
 */

const isLiveMode = !!(
  process.env.OPENCLAW_STATE_DIR ||
  process.env.OPENCLAW_CLI_PATH ||
  process.env.OPENCLAW_PROFILE
)

class DataStore {
  private _agents: Agent[]
  private _tasks: Task[]
  private _runs: Run[]
  private _runEvents: RunEvent[]
  private _conversations: Conversation[]
  private _messages: Message[]
  private _dailyUsage: DailyUsage[]
  private _modelUsage: ModelUsage[]

  constructor() {
    if (isLiveMode) {
      // Live mode: start empty, sync.ts will hydrate from runtime
      this._agents = []
      this._tasks = []
      this._runs = []
      this._runEvents = []
      this._conversations = []
      this._messages = []
      this._dailyUsage = []
      this._modelUsage = []
    } else {
      // Demo mode: seed with mock data
      this._agents = [...mockAgents]
      this._tasks = [...mockTasks]
      this._runs = [...mockRuns]
      this._runEvents = [...mockRunEvents]
      this._conversations = [...mockConversations]
      this._messages = [...mockMessages]
      this._dailyUsage = [...mockDailyUsage]
      this._modelUsage = [...mockModelUsage]
    }
  }

  /**
   * Replace all store contents atomically. Called by sync.ts.
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

  getMessages(conversationId: string): Message[] {
    return this._messages.filter((m) => m.conversation_id === conversationId)
  }

  // --- Usage ---
  getDailyUsage(): DailyUsage[] {
    return this._dailyUsage
  }

  getModelUsage(): ModelUsage[] {
    return this._modelUsage
  }

  // --- Activity (computed) ---
  getRecentActivity(limit = 20) {
    type ActivityItem = {
      id: string
      text: string
      time: string
      type: 'started' | 'completed' | 'failed' | 'needs_approval' | 'stalled'
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
      })

      if (run.status === 'completed' && run.ended_at) {
        items.push({
          id: `act-end-${run.id}`,
          text: `${name} completed ${title}`,
          time: run.ended_at,
          type: 'completed',
        })
      }
      if (run.status === 'failed' && run.ended_at) {
        items.push({
          id: `act-fail-${run.id}`,
          text: `${name} failed on ${title} — ${run.retry_count} retries exhausted`,
          time: run.ended_at,
          type: 'failed',
        })
      }
      if (run.status === 'needs_approval') {
        items.push({
          id: `act-approval-${run.id}`,
          text: `${name} completed ${title} — awaiting approval`,
          time: run.ended_at || run.started_at,
          type: 'needs_approval',
        })
      }
      if (run.status === 'stalled') {
        items.push({
          id: `act-stall-${run.id}`,
          text: `${name} stalled on ${title}`,
          time: run.started_at,
          type: 'stalled',
        })
      }
    }

    return items
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
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
}

// Singleton — survives across API route invocations in dev/prod
const globalForStore = globalThis as unknown as { __dataStore?: DataStore }
export const store = globalForStore.__dataStore ?? new DataStore()
globalForStore.__dataStore = store
