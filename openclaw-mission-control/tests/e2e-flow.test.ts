/**
 * End-to-end integration test: simulates the full user journey.
 *
 * Flow tested:
 * 1. Create a project (ScoutAI)
 * 2. Create a primary agent and assign it
 * 3. Simulate a chat conversation
 * 4. Agent identifies tasks via [TASK:] markers → tasks appear in Backlog
 * 5. Agent delegates to sub-agent via [DELEGATE:] markers → sub-agent created
 * 6. User promotes task from Backlog → In Progress
 * 7. Sub-agent works and creates findings → visible to other agents
 * 8. Cross-project dashboard shows correct metrics
 * 9. Activity log, runs, conversations all populated correctly
 *
 * No actual SDK calls — tests data flow, store operations, and extraction logic.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// We need to test the store and extraction functions directly.
// Since extractAndCreateTasks and extractAndDelegate aren't exported,
// we'll import the module and use the store to verify outcomes.

// We'll test through the store directly
import { store } from '../lib/store.js'
import type { RoleLane, Task } from '../lib/types.js'

describe('End-to-End User Journey', () => {
  // Helper to create timestamps
  const now = () => new Date().toISOString()

  beforeEach(() => {
    // Clear all runtime data (keep bootstrap project/agent for now)
    store.replaceAll({
      agents: [],
      tasks: [],
      runs: [],
      runEvents: [],
      conversations: [],
      messages: [],
      dailyUsage: [],
      modelUsage: [],
    })
  })

  describe('Step 1: Project Creation', () => {
    it('creates a project with objective and primary agent fields', () => {
      const project = {
        id: 'proj-scoutai',
        name: 'ScoutAI',
        slug: 'scoutai',
        description: 'Competitive intelligence platform',
        color: '#3b82f6',
        objective: 'Build a competitive research tool for SMB founders',
        created_at: now(),
        updated_at: now(),
      }
      store.upsertProject(project)

      const retrieved = store.getProject('proj-scoutai')
      assert.ok(retrieved, 'Project should exist')
      assert.equal(retrieved.name, 'ScoutAI')
      assert.equal(retrieved.objective, 'Build a competitive research tool for SMB founders')
    })

    it('project appears in getProjects()', () => {
      store.upsertProject({
        id: 'proj-scoutai',
        name: 'ScoutAI',
        slug: 'scoutai',
        description: 'CI platform',
        color: '#3b82f6',
        created_at: now(),
        updated_at: now(),
      })
      const projects = store.getProjects()
      assert.ok(projects.some(p => p.id === 'proj-scoutai'))
    })
  })

  describe('Step 2: Primary Agent Assignment', () => {
    it('creates a primary agent and assigns to project', () => {
      const ts = now()
      // Create project
      store.upsertProject({
        id: 'proj-scoutai',
        name: 'ScoutAI',
        slug: 'scoutai',
        description: 'CI platform',
        color: '#3b82f6',
        primary_agent_id: 'agent-primary',
        created_at: ts,
        updated_at: ts,
      })

      // Create primary agent
      store.upsertAgent({
        id: 'agent-primary',
        name: 'ScoutAI Lead',
        slug: 'scoutai-lead',
        description: 'Primary orchestrator for ScoutAI',
        system_prompt: 'You orchestrate the ScoutAI project.',
        specialization: 'General',
        default_model: 'anthropic/claude-sonnet-4-6',
        escalation_model: 'anthropic/claude-opus-4-5',
        max_budget_per_run: 5.0,
        allowed_tools: [],
        avatar_color: '#3b82f6',
        is_active: true,
        total_runs: 0,
        created_at: ts,
        updated_at: ts,
        project_id: 'proj-scoutai',
        project_name: 'ScoutAI',
        designation: 'primary',
      })

      // Assign as advisor role
      store.upsertRoleAssignment({
        id: 'ra-advisor',
        project_id: 'proj-scoutai',
        role: 'advisor',
        agent_id: 'agent-primary',
        notes: 'Primary agent',
        created_at: ts,
      })

      const project = store.getProject('proj-scoutai')
      assert.equal(project?.primary_agent_id, 'agent-primary')

      const agent = store.getAgent('agent-primary')
      assert.equal(agent?.designation, 'primary')
      assert.equal(agent?.project_id, 'proj-scoutai')

      const roles = store.getRoleAssignments('proj-scoutai')
      assert.equal(roles.length, 1)
      assert.equal(roles[0].role, 'advisor')
    })
  })

  describe('Step 3: Chat Conversation + Task Extraction', () => {
    it('simulates a conversation where agent identifies tasks', () => {
      const ts = now()

      // Setup project + agent
      store.upsertProject({
        id: 'proj-scoutai', name: 'ScoutAI', slug: 'scoutai',
        description: 'CI', color: '#3b82f6', created_at: ts, updated_at: ts,
      })
      store.upsertAgent({
        id: 'agent-primary', name: 'Lead', slug: 'lead',
        description: '', system_prompt: '', specialization: '',
        default_model: 'anthropic/claude-sonnet-4-6', escalation_model: '',
        max_budget_per_run: 5, allowed_tools: [], avatar_color: '#3b82f6',
        is_active: true, total_runs: 0, created_at: ts, updated_at: ts,
      })

      // Create conversation
      const convId = 'conv-test-001'
      store.upsertConversation({
        id: convId,
        agent_id: 'agent-primary',
        title: 'Competitive Analysis Discussion',
        task_id: null,
        status: 'active',
        message_count: 0,
        total_cost: 0,
        last_message_at: ts,
        project_id: 'proj-scoutai',
      })

      // User message
      store.addMessage({
        id: 'msg-u1', conversation_id: convId, role: 'user',
        content: 'Analyze the competitive landscape for ScoutAI',
        agent_id: null, model: null,
        input_tokens: null, output_tokens: null, estimated_cost: null,
        created_at: ts,
      })

      // Simulate agent response with task markers
      const agentResponse = `I've analyzed the competitive landscape. Here are the key findings:

1. There are 5 major competitors in the SMB competitive intelligence space.
2. Most focus on enterprise - there's a gap in the SMB market.

Based on this analysis, I've identified these actionable tasks:

[TASK: title="Research top 5 competitor pricing models" priority="high" description="Deep dive into pricing tiers, features per tier, and positioning of Crayon, Klue, Kompyte, Semrush CI, and Similarweb"]

[TASK: title="Map competitor feature gaps for SMB" priority="medium" description="Identify features that enterprise CI tools have but SMBs don't need, and features SMBs need but aren't served"]

[TASK: title='Draft initial positioning statement' priority='medium' description='Create a 1-page positioning doc differentiating ScoutAI for SMB founders']`

      store.addMessage({
        id: 'msg-a1', conversation_id: convId, role: 'assistant',
        content: agentResponse, agent_id: 'agent-primary',
        model: 'anthropic/claude-sonnet-4-6',
        input_tokens: 1500, output_tokens: 800,
        estimated_cost: 0.0165,
        created_at: ts,
      })

      // Now simulate task extraction (what agent-runtime does)
      // Test the regex patterns used in extractAndCreateTasks — handles double OR single quotes
      const taskPatternFlexible = /\[TASK:\s*title\s*=\s*(?:"([^"]+)"|'([^']+)')\s*priority\s*=\s*(?:"([^"]+)"|'([^']+)')\s*description\s*=\s*(?:"([^"]+)"|'([^']+)')\s*\]/gi
      const matches: { title: string; priority: string; description: string }[] = []
      let match
      while ((match = taskPatternFlexible.exec(agentResponse)) !== null) {
        matches.push({
          title: match[1] || match[2],
          priority: match[3] || match[4],
          description: match[5] || match[6],
        })
      }

      assert.equal(matches.length, 3, 'Should extract 3 tasks (including single-quoted)')
      assert.equal(matches[0].title, "Research top 5 competitor pricing models")
      assert.equal(matches[0].priority, 'high')
      assert.equal(matches[2].title, 'Draft initial positioning statement')

      // Create the tasks in the store (simulating extractAndCreateTasks)
      for (const t of matches) {
        store.upsertTask({
          id: `task-${Math.random().toString(36).slice(2, 10)}`,
          title: t.title,
          description: t.description,
          priority: t.priority as 'high' | 'medium' | 'low',
          status: 'queued',
          assigned_agent_id: 'agent-primary',
          created_by: 'agent',
          project_id: 'proj-scoutai',
          created_at: ts,
          updated_at: ts,
        })
      }

      // Verify tasks in store
      const tasks = store.getTasksByProject('proj-scoutai')
      assert.equal(tasks.length, 3, 'All 3 tasks should be in project')
      assert.ok(tasks.every(t => t.status === 'queued'), 'All tasks should be queued (Backlog)')
      assert.ok(tasks.every(t => t.created_by === 'agent'), 'All tasks created by agent')
      assert.ok(tasks.every(t => t.project_id === 'proj-scoutai'), 'All tasks in correct project')
    })
  })

  describe('Step 4: Sub-agent Delegation', () => {
    it('simulates primary agent delegating to sub-agents', () => {
      const ts = now()

      // Setup
      store.upsertProject({
        id: 'proj-scoutai', name: 'ScoutAI', slug: 'scoutai',
        description: 'CI', color: '#3b82f6', primary_agent_id: 'agent-primary',
        created_at: ts, updated_at: ts,
      })
      store.upsertAgent({
        id: 'agent-primary', name: 'Lead', slug: 'lead',
        description: '', system_prompt: '', specialization: '',
        default_model: 'anthropic/claude-sonnet-4-6', escalation_model: '',
        max_budget_per_run: 5, allowed_tools: [], avatar_color: '#3b82f6',
        is_active: true, total_runs: 0, created_at: ts, updated_at: ts,
        designation: 'primary',
      })

      // Simulate delegation markers
      const delegateResponse = `I'll delegate the research tasks to specialized sub-agents:

[DELEGATE: role="research" goal="Analyze competitor pricing models for Crayon, Klue, Kompyte, Semrush CI, and Similarweb" priority="high"]

[DELEGATE: role="strategy" goal="Draft competitive positioning strategy based on SMB gap analysis" priority="medium"]`

      // Test delegation regex
      const delegatePattern = /\[DELEGATE:\s*role\s*=\s*["']([^"']+)["']\s*goal\s*=\s*["']([^"']+)["']\s*(?:priority\s*=\s*["']([^"']+)["'])?\s*\]/gi
      const delegations: { role: string; goal: string; priority: string }[] = []
      let match
      while ((match = delegatePattern.exec(delegateResponse)) !== null) {
        delegations.push({ role: match[1], goal: match[2], priority: match[3] || 'medium' })
      }

      assert.equal(delegations.length, 2, 'Should extract 2 delegations')
      assert.equal(delegations[0].role, 'research')
      assert.equal(delegations[1].role, 'strategy')

      // Simulate sub-agent creation (what extractAndDelegate does)
      for (const d of delegations) {
        const subAgentId = `agent-${d.role}-test`
        store.upsertAgent({
          id: subAgentId,
          name: `${d.role.charAt(0).toUpperCase() + d.role.slice(1)} Agent`,
          slug: `${d.role}-scoutai`,
          description: `Sub-agent for ${d.role}`,
          system_prompt: `You are a ${d.role} specialist.`,
          specialization: d.role,
          default_model: 'anthropic/claude-sonnet-4-6',
          escalation_model: 'anthropic/claude-opus-4-5',
          max_budget_per_run: 2.0,
          allowed_tools: [],
          avatar_color: '#8b5cf6',
          is_active: true,
          total_runs: 0,
          created_at: ts,
          updated_at: ts,
          project_id: 'proj-scoutai',
          project_name: 'ScoutAI',
          designation: 'sub-agent',
        })

        store.upsertRoleAssignment({
          id: `ra-${d.role}-test`,
          project_id: 'proj-scoutai',
          role: d.role as RoleLane,
          agent_id: subAgentId,
          notes: 'Auto-created by delegation',
          created_at: ts,
        })

        store.upsertTask({
          id: `task-delegated-${d.role}`,
          title: d.goal.slice(0, 100),
          description: d.goal,
          priority: d.priority as Task['priority'],
          status: 'queued',
          assigned_agent_id: subAgentId,
          created_by: 'agent',
          project_id: 'proj-scoutai',
          created_at: ts,
          updated_at: ts,
        })
      }

      // Verify sub-agents created
      const agents = store.getAgents()
      const subAgents = agents.filter(a => a.designation === 'sub-agent')
      assert.equal(subAgents.length, 2, 'Should have 2 sub-agents')

      // Verify role assignments include the delegated roles
      const roles = store.getRoleAssignments('proj-scoutai')
      assert.ok(roles.length >= 2, 'Should have at least 2 role assignments')
      assert.ok(roles.some(r => r.role === 'research'), 'Should have research role')
      assert.ok(roles.some(r => r.role === 'strategy'), 'Should have strategy role')

      // Verify delegated tasks created
      const tasks = store.getTasksByProject('proj-scoutai')
      assert.equal(tasks.length, 2, 'Should have 2 delegated tasks')
      assert.ok(tasks.every(t => t.status === 'queued'), 'All in Backlog')
    })
  })

  describe('Step 5: User Promotes Task → In Progress', () => {
    it('promotes a task from Backlog to In Progress', () => {
      const ts = now()
      store.upsertTask({
        id: 'task-promote-test',
        title: 'Research competitors',
        description: 'Deep dive',
        priority: 'high',
        status: 'queued',
        assigned_agent_id: 'agent-primary',
        created_by: 'agent',
        project_id: 'proj-scoutai',
        created_at: ts,
        updated_at: ts,
      })

      // Verify starts in Backlog
      assert.equal(store.getTask('task-promote-test')?.status, 'queued')

      // Promote to In Progress
      const updated = store.updateTaskStatus('task-promote-test', 'running')
      assert.ok(updated, 'Should update successfully')
      assert.equal(store.getTask('task-promote-test')?.status, 'running')

      // Verify task is retrievable with new status
      const task = store.getTask('task-promote-test')!
      assert.equal(task.status, 'running', 'Task should be running after promotion')
    })

    it('promotes through full lifecycle: queued → running → needs_approval → completed', () => {
      const ts = now()
      store.upsertTask({
        id: 'task-lifecycle',
        title: 'Full lifecycle test',
        description: 'Test',
        priority: 'medium',
        status: 'queued',
        assigned_agent_id: 'agent-primary',
        created_by: 'agent',
        project_id: 'proj-scoutai',
        created_at: ts,
        updated_at: ts,
      })

      store.updateTaskStatus('task-lifecycle', 'running')
      assert.equal(store.getTask('task-lifecycle')?.status, 'running')

      store.updateTaskStatus('task-lifecycle', 'needs_approval')
      assert.equal(store.getTask('task-lifecycle')?.status, 'needs_approval')

      store.updateTaskStatus('task-lifecycle', 'completed')
      assert.equal(store.getTask('task-lifecycle')?.status, 'completed')
    })
  })

  describe('Step 6: Inter-Agent Context Sharing', () => {
    it('agent B can see agent A findings via conversation summaries', () => {
      const ts = now()

      // Setup project
      store.upsertProject({
        id: 'proj-scoutai', name: 'ScoutAI', slug: 'scoutai',
        description: 'CI', color: '#3b82f6', created_at: ts, updated_at: ts,
      })

      // Agent A (Research) has a conversation with findings
      store.upsertConversation({
        id: 'conv-research', agent_id: 'agent-research', title: 'Competitor Research',
        task_id: null, status: 'active', message_count: 2,
        total_cost: 0.02, last_message_at: ts, project_id: 'proj-scoutai',
      })
      store.addMessage({
        id: 'msg-r1', conversation_id: 'conv-research', role: 'assistant',
        content: 'Research findings: Crayon charges $25K/yr for enterprise. Klue targets mid-market at $15K/yr. No one serves SMBs under $500/mo. Major opportunity.',
        agent_id: 'agent-research', model: 'anthropic/claude-sonnet-4-6',
        input_tokens: 500, output_tokens: 200, estimated_cost: 0.005,
        created_at: ts,
      })

      // Verify conversation is retrievable by project
      const convs = store.getConversationsByProject('proj-scoutai')
      assert.equal(convs.length, 1)

      // Verify messages are retrievable
      const msgs = store.getMessages('conv-research')
      assert.equal(msgs.length, 1)
      assert.ok(msgs[0].content.includes('Crayon charges $25K/yr'))

      // When Agent B starts, buildProjectContext would pull this
      // Simulate what buildProjectContext does:
      const projectConvs = store.getConversationsByProject('proj-scoutai')
      const findings: string[] = []
      for (const conv of projectConvs.slice(-5)) {
        const messages = store.getMessages(conv.id)
        const assistantMsgs = messages.filter(m => m.role === 'assistant')
        if (assistantMsgs.length > 0) {
          const last = assistantMsgs[assistantMsgs.length - 1]
          const agentName = last.agent_id || 'Agent'
          findings.push(`${agentName}: ${last.content.slice(0, 300)}`)
        }
      }

      assert.equal(findings.length, 1, 'Should have 1 finding from Agent A')
      assert.ok(findings[0].includes('Crayon charges'), 'Finding should include research data')
      assert.ok(findings[0].includes('Major opportunity'), 'Finding should include conclusion')
    })
  })

  describe('Step 7: Runs and Cost Tracking', () => {
    it('tracks run with tokens and cost', () => {
      const ts = now()
      const run = {
        id: 'run-test-001',
        task_id: 'task-research',
        agent_id: 'agent-research',
        status: 'completed' as const,
        actual_model_used: 'anthropic/claude-sonnet-4-6',
        started_at: ts,
        ended_at: ts,
        input_tokens: 15000,
        output_tokens: 5000,
        estimated_cost: (15000 * 3 + 5000 * 15) / 1_000_000, // 0.12
        retry_count: 0,
        parent_run_id: null,
        project_id: 'proj-scoutai',
        agent_name: 'Research Agent',
        task_title: 'Analyze competitors',
      }
      store.upsertRun(run)

      const retrieved = store.getRun('run-test-001')
      assert.ok(retrieved)
      assert.equal(retrieved.status, 'completed')
      assert.equal(retrieved.input_tokens, 15000)
      assert.equal(retrieved.output_tokens, 5000)
      assert.ok(retrieved.estimated_cost > 0, 'Cost should be positive')
      assert.ok(Math.abs(retrieved.estimated_cost - 0.12) < 0.001, 'Cost should be ~$0.12')
    })

    it('getActiveRuns filters correctly', () => {
      const ts = now()
      store.upsertRun({
        id: 'run-active', task_id: '', agent_id: '', status: 'running',
        actual_model_used: '', started_at: ts, ended_at: null,
        input_tokens: 0, output_tokens: 0, estimated_cost: 0,
        retry_count: 0, parent_run_id: null, project_id: 'proj-scoutai',
      })
      store.upsertRun({
        id: 'run-done', task_id: '', agent_id: '', status: 'completed',
        actual_model_used: '', started_at: ts, ended_at: ts,
        input_tokens: 0, output_tokens: 0, estimated_cost: 0,
        retry_count: 0, parent_run_id: null, project_id: 'proj-scoutai',
      })

      const active = store.getActiveRuns()
      assert.equal(active.length, 1)
      assert.equal(active[0].id, 'run-active')
    })
  })

  describe('Step 8: Cross-Project Dashboard Metrics', () => {
    it('returns all data when projectId is null (All Projects mode)', () => {
      const ts = now()

      // Project 1
      store.upsertTask({
        id: 'task-p1', title: 'P1 task', description: '', priority: 'high',
        status: 'queued', assigned_agent_id: null, created_by: 'agent',
        project_id: 'proj-scoutai', created_at: ts, updated_at: ts,
      })

      // Project 2
      store.upsertTask({
        id: 'task-p2', title: 'P2 task', description: '', priority: 'medium',
        status: 'running', assigned_agent_id: null, created_by: 'agent',
        project_id: 'proj-fetchly', created_at: ts, updated_at: ts,
      })

      // All tasks (no filter)
      const allTasks = store.getTasks()
      assert.equal(allTasks.length, 2, 'Should see tasks from both projects')

      // Filtered
      const p1Tasks = store.getTasksByProject('proj-scoutai')
      assert.equal(p1Tasks.length, 1)
      assert.equal(p1Tasks[0].id, 'task-p1')
    })
  })

  describe('Step 9: Activity Log', () => {
    it('generates activity from runs', () => {
      const ts = now()
      store.upsertAgent({
        id: 'agent-test', name: 'Test Agent', slug: 'test',
        description: '', system_prompt: '', specialization: '',
        default_model: '', escalation_model: '', max_budget_per_run: 0,
        allowed_tools: [], avatar_color: '', is_active: true,
        total_runs: 0, created_at: ts, updated_at: ts,
      })
      store.upsertRun({
        id: 'run-act-1', task_id: 'task-1', agent_id: 'agent-test',
        status: 'completed', actual_model_used: 'claude-sonnet-4-6',
        started_at: ts, ended_at: ts,
        input_tokens: 1000, output_tokens: 500, estimated_cost: 0.01,
        retry_count: 0, parent_run_id: null, project_id: 'proj-scoutai',
        agent_name: 'Test Agent', task_title: 'Research task',
      })

      const activity = store.getRecentActivity()
      assert.ok(activity.length >= 2, 'Should have started + completed events')
      assert.ok(activity.some(a => a.type === 'started'))
      assert.ok(activity.some(a => a.type === 'completed'))
    })
  })

  describe('Step 10: Project Context for System Prompt', () => {
    it('builds complete project context with all required fields', () => {
      const ts = now()

      // Full project setup
      store.upsertProject({
        id: 'proj-full', name: 'FullTest', slug: 'fulltest',
        description: 'Full context test', color: '#000',
        objective: 'Build the best product',
        created_at: ts, updated_at: ts,
      })
      store.updateProjectFocus('proj-full', 'Launching MVP next week')

      // Agent
      store.upsertAgent({
        id: 'agent-ctx', name: 'Context Agent', slug: 'ctx',
        description: '', system_prompt: '', specialization: '',
        default_model: '', escalation_model: '', max_budget_per_run: 0,
        allowed_tools: [], avatar_color: '', is_active: true,
        total_runs: 0, created_at: ts, updated_at: ts,
      })

      // Role assignment
      store.upsertRoleAssignment({
        id: 'ra-ctx', project_id: 'proj-full', role: 'research',
        agent_id: 'agent-ctx', notes: '', created_at: ts,
      })

      // Task
      store.upsertTask({
        id: 'task-ctx', title: 'Existing research task', description: 'Already queued',
        priority: 'high', status: 'queued', assigned_agent_id: 'agent-ctx',
        created_by: 'agent', project_id: 'proj-full', created_at: ts, updated_at: ts,
      })

      // Conversation with findings
      store.upsertConversation({
        id: 'conv-ctx', agent_id: 'agent-ctx', title: 'Research findings',
        task_id: null, status: 'active', message_count: 1,
        total_cost: 0, last_message_at: ts, project_id: 'proj-full',
      })
      store.addMessage({
        id: 'msg-ctx', conversation_id: 'conv-ctx', role: 'assistant',
        content: 'Found that competitor X just raised $10M Series A.',
        agent_id: 'agent-ctx', model: null,
        input_tokens: null, output_tokens: null, estimated_cost: null,
        created_at: ts,
      })

      // Verify ProjectContext
      const ctx = store.getProjectContext('proj-full')
      assert.ok(ctx, 'Context should exist')
      assert.equal(ctx.project.name, 'FullTest')
      assert.equal(ctx.project.objective, 'Build the best product')
      assert.equal(ctx.taskCount, 1)
      assert.equal(ctx.queuedCount, 1)
      assert.equal(ctx.assignments.length, 1)

      // Verify focus was set
      assert.equal(ctx.project.focus?.summary, 'Launching MVP next week')
    })
  })
})
