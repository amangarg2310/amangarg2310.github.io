export type AgentStatus = 'active' | 'inactive' | 'busy';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'needs_approval'
  | 'failed'
  | 'completed'
  | 'paused'
  | 'stalled';

export type RunStatus = TaskStatus | 'idle';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type EventType =
  | 'started'
  | 'model_called'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'response'
  | 'error'
  | 'retry'
  | 'completed'
  | 'escalated'
  | 'child_spawned'
  | 'paused'
  | 'resumed';

export type ModelTier = 'economy' | 'standard' | 'premium';

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string;
  system_prompt: string;
  specialization: string;
  default_model: string;
  escalation_model: string;
  max_budget_per_run: number;
  allowed_tools: string[];
  is_active: boolean;
  avatar_color: string;
  created_at: string;
  updated_at: string;
  // Project assignment
  project_id?: string | null;
  project_name?: string | null;
  designation?: 'primary' | 'sub-agent' | null;
  // Computed/aggregated
  total_runs?: number;
  avg_cost_per_run?: number;
  recent_runs?: number;
  status?: AgentStatus;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: TaskStatus;
  assigned_agent_id: string | null;
  created_by: string;
  project_id?: string | null;
  role?: RoleLane | null;
  tier?: string | null;
  autonomy?: string | null;
  agent_strategy?: string | null;
  workflow_chain_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  task_id: string;
  agent_id: string;
  status: RunStatus;
  actual_model_used: string;
  started_at: string;
  ended_at: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  retry_count: number;
  parent_run_id: string | null;
  project_id?: string | null;
  // Joined
  agent_name?: string;
  task_title?: string;
}

export interface RunEvent {
  id: string;
  run_id: string;
  timestamp: string;
  event_type: EventType;
  status: string;
  summary: string;
  metadata: Record<string, unknown>;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  tool_name: string | null;
}

export interface MessageImage {
  id: string;
  data: string; // base64 data URL
  name: string;
  type: string; // mime type
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  images?: MessageImage[];
  agent_id: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  tool_calls?: ToolCall[];
  created_at: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  output: string;
  duration_ms: number;
}

export interface Conversation {
  id: string;
  title: string;
  agent_id: string;
  task_id: string | null;
  status: 'active' | 'idle' | 'completed' | 'archived';
  project_id?: string | null;
  last_message_at: string;
  message_count: number;
  total_cost: number;
}

export interface UsageRecord {
  id: string;
  date_bucket: string;
  agent_id: string | null;
  model: string;
  task_type: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  runs: number;
}

export interface ModelUsage {
  model: string;
  tier: ModelTier;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  percentage: number;
}

// --- Roles ---

export type RoleLane =
  | 'research'
  | 'strategy'
  | 'product'
  | 'content'
  | 'performance_marketing'
  | 'consumer_insights'
  | 'advisor';

export interface RoleLaneConfig {
  id: RoleLane;
  label: string;
  description: string;
  color: string;
  suggestedJobs: SuggestedJob[];
}

export interface SuggestedJob {
  id: string;
  title: string;
  description: string;
  cadence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'on_demand';
  enabled: boolean;
}

// --- Projects ---

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  focus?: ProjectFocus | null;
  objective?: string | null;
  primary_agent_id?: string | null;
  repo_url?: string | null;
  repo_branch?: string | null;
  repo_commit?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleAssignment {
  id: string;
  project_id: string;
  role: RoleLane;
  agent_id: string;
  notes: string;
  created_at: string;
}

export interface ProjectFocus {
  summary: string;
  updated_at: string;
}

export interface ProjectContext {
  project: Project;
  assignments: RoleAssignment[];
  taskCount: number;
  activeRunCount: number;
  recentConversationCount: number;
  blockedCount: number;
  queuedCount: number;
  completedCount: number;
  lastActivityAt: string | null;
}

export interface AutomationConfig {
  project_id: string;
  job_id: string;
  role: RoleLane;
  enabled: boolean;
  cadence: SuggestedJob['cadence'];
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface CommandCenterData {
  project: Project;
  focus: ProjectFocus | null;
  roleSummaries: RoleSummary[];
  blockers: BlockerItem[];
  nextActions: NextAction[];
  budgetSummary: BudgetSummary;
  recentActivity: ActivityItem[];
  automationSummary: { enabled: number; total: number };
  activeWorkflows: WorkflowInstanceSummary[];
}

export interface RoleSummary {
  role: RoleLane;
  agent_id: string | null;
  agent_name: string | null;
  agent_status: AgentStatus | null;
  taskCount: number;
  activeRunCount: number;
  lastActivity: string | null;
  automationsEnabled: number;
  automationsTotal: number;
}

export interface BlockerItem {
  id: string;
  type: 'failed' | 'stalled' | 'needs_approval';
  title: string;
  agent_name: string;
  time: string;
  run_id: string;
}

export interface NextAction {
  id: string;
  type: 'assign_role' | 'review_approval' | 'investigate_stall' | 'enable_automation' | 'run_workflow';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export interface BudgetSummary {
  costToday: number;
  costTotal: number;
  runsToday: number;
  dailyTrend: number[];
}

export interface ActivityItem {
  id: string;
  text: string;
  time: string;
  type: 'started' | 'completed' | 'failed' | 'needs_approval' | 'stalled';
  project_id?: string | null;
}

export interface WorkflowInstanceSummary {
  id: string;
  chain_name: string;
  current_step: number;
  total_steps: number;
  status: 'running' | 'waiting' | 'completed' | 'failed';
  updated_at: string;
}
