# Mission Control

Project-centric founder operating system powered by Claude Code SDK. Manages multiple early-stage startup workstreams (ScoutAI, Fetchly, Heritage, etc.) through 7 role lanes with smart task routing, workflow automation, and execution policy.

## Vision

This platform is a centralized mission control where the founder can run, manage, and oversee all Claude agents in one place. Each project — whether it is an app, a research initiative, or another type of build — has a primary agent that can break a larger objective into smaller tasks by creating sub-agents as needed based on the complexity of the work. Those sub-agents execute their individual assignments, feed their outputs back to the primary agent, and the primary agent reviews, synthesizes, and escalates work to the founder when human input or approval is needed.

The chat workspace exists to make this the single operating environment for everything, so that instead of juggling multiple windows and fragmented workflows, the founder can do in this platform everything they would otherwise need to do across separate interfaces (including Claude Code itself). At any moment, they should be able to toggle between projects and instantly understand what every agent and sub-agent is working on, what stage each task is in, and where attention is needed.

At its core, this functions like a multi-agent task force: agents can collaborate, compare notes, strategize together, build on one another's work, and coordinate intelligently toward a shared outcome, while still giving the founder clear oversight and control from one unified command center.

### Key Principles

1. **Chat = Claude Code mirror**: The chat workspace mirrors actual Claude Code conversations. What the founder types there runs through Claude Code. Messages, tool calls, and responses should all be visible. This replaces the need to use Claude Code separately.
2. **Agents identify tasks, not users**: Tasks are NOT created by sending a chat message. The agent identifies actionable work during conversation and creates tasks that appear in the Backlog. The founder promotes tasks to In Progress when ready.
3. **Primary agent + sub-agents**: Each project has a primary agent that orchestrates. For complex work, the primary agent spawns sub-agents (per role lane), coordinates their output, and synthesizes results.
4. **Multi-agent collaboration**: Agents share context, compare research, challenge conclusions, and build on each other's work. The dashboard is the meeting room where this coordination is visible.
5. **No mock data, no demo mode**: All data is real-time from agent runtime. Store starts empty, fills with real conversations and tasks.
6. **Image/screenshot support**: Chat workspace supports image upload (file picker + paste) just like Claude Code. Images are stored with messages and displayed inline in the thread.

## Tech Stack

Next.js 16, React 19, TypeScript, TailwindCSS 4, Framer Motion, Radix UI, Recharts, @anthropic-ai/claude-agent-sdk

## Key Commands

```bash
cd openclaw-mission-control
npm install
npm run dev       # Start dev server (localhost:3000)
npm run build     # Production build
npm run lint      # ESLint
npm run test      # Bridge layer tests
```

## Architecture

### Agent Runtime (`lib/agent-runtime.ts`)

- Agents spawned via Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) `query()` function
- Uses existing Claude Code login — NO API key needed
- Full tool access: Read, Write, Bash, Grep, WebFetch, WebSearch, etc.
- **Project-aware context**: System prompt includes project name, objective, focus, existing tasks, and recent findings from other agents
- **Inter-agent sharing**: Each agent sees summaries of recent conversations by other agents on the same project
- **Task extraction**: Parses `[TASK: title="..." priority="..." description="..."]` from agent output (flexible: single/double quotes)
- **Sub-agent delegation**: Primary agents can output `[DELEGATE: role="research" goal="..." priority="..."]` to auto-spawn sub-agents
- **Auto sub-agent creation**: When primary agent delegates to a role with no assigned agent, one is created automatically
- Role-based system prompts in `ROLE_PROMPTS` map
- Active sessions tracked in `activeSessions` Map (keyed by conversation ID)
- Cost estimation: `(inputTokens * 3 + outputTokens * 15) / 1_000_000` (Sonnet pricing)

### Store (`lib/store.ts`)

- In-memory singleton, always starts empty — NO mock/demo data anywhere
- Runtime data managed by `agent-runtime.ts` (upsertRun, addMessage, upsertConversation)
- Dashboard-owned data (projects, roles, automations, workflows) persists to disk via `project-store.ts`
- Disk location: `<stateDir>/dashboard/projects.json` (atomic writes)

### Data Flow

```
User action (chat/task) → POST /api/chat → lib/agent-runtime.ts → Claude Agent SDK query()
                                                    ↓
                                              lib/store.ts (in-memory singleton)
                                                    ↓
                                         app/api/* routes (server, force-dynamic)
                                                    ↓
                                         lib/api.ts (client-side fetch, no-store cache)
                                                    ↓
                                         lib/hooks.ts (useApi<T> with optional refetchInterval)
                                                    ↓
                                         app/ pages + components/
```

### 7 Role Lanes

Each project has 7 role lanes, each mappable to a Claude agent:

| Role | Default Tier | Key Automations |
|------|-------------|-----------------|
| Research | Economy (Haiku) | Trend scan, competitor watch, culture pulse |
| Strategy | Standard (Sonnet) | Weekly memo, opportunity/pricing review |
| Product & PMM | Standard (Sonnet) | Packaging review, product recommendation memo |
| Content & Marketing | Economy (Haiku) | Content batch planner, copy pipeline, channel recs |
| Performance Marketing | Standard (Sonnet) | Campaign optimization, ROAS analysis |
| Consumer Insights | Economy (Haiku) | Review digest, sentiment clustering |
| Advisor | Standard (Sonnet) | Founder memo, "what next?" summary, decision memo |

### Model Tiers → SDK Models

- Economy → `haiku` (cheapest, fast)
- Standard → `sonnet` (default, balanced)
- Premium → `opus` (most capable, expensive)
- Local → removed (was OpenClaw concept, not applicable)

### Key Systems

- **Agent Runtime** (`lib/agent-runtime.ts`): Spawns Claude agents via SDK, manages sessions, tracks runs/conversations, role-based prompts
- **Execution Policy** (`lib/execution-policy.ts`): Role-based model routing, tier recommendation
- **Task Recommender** (`lib/task-recommender.ts`): Infers best role from goal keywords, recommends tier/autonomy/model
- **Workflow Chains** (`lib/workflow-chains.ts`): Predefined handoff patterns (Research→Strategy, full GTM pipeline)
- **Workflow Orchestrator** (`lib/workflow-orchestrator.ts`): Auto-creates queued task for next step when current step completes

## File Structure

```
app/
  page.tsx                    # Dashboard (metrics, getting-started, team-view, activity)
  projects/page.tsx           # Project grid with status breakdown
  projects/[id]/page.tsx      # Project workspace (Chat | Boards | Activity tabs)
  runs/page.tsx               # Run inspector table with filters/search
  activity/page.tsx           # Activity timeline with date headers
  approvals/page.tsx          # Approval queue for human oversight
  settings/page.tsx           # Model providers, budgets, pricing
  usage/page.tsx              # Usage & cost dashboard
  boards/page.tsx             # Redirects → /projects
  chats/page.tsx              # Redirects → /projects
  api/chat/route.ts           # POST: send message, spawn agent
  api/agents/route.ts         # GET: list agents
  api/agents/[id]/route.ts    # GET: single agent detail
  api/tasks/route.ts          # GET/POST: list/create tasks
  api/tasks/[id]/status/      # PATCH: update task status
  api/runs/route.ts           # GET: list runs
  api/runs/[id]/stop/         # POST: stop a run
  api/conversations/          # GET: list/detail conversations
  api/projects/[id]/          # CRUD + command-center, roles, automations, workflows, recommend

components/
  dashboard/                  # Dashboard widgets (getting-started, run-status-board, team-view, activity-feed, agent-tasks, create-task-modal)
  layout/                     # Sidebar navigation
  ui/                         # Reusable primitives (status-badge, agent-avatar, model-badge, tooltip, page-header, toast)

lib/
  agent-runtime.ts           # Claude Agent SDK wrapper (server-only)
  store.ts                   # In-memory singleton data store (server-only)
  sync.ts                    # Agent status monitoring (10s interval)
  api.ts                     # Client-side fetch functions
  hooks.ts                   # React data-fetching hooks (useApi, useAgents, useTasks, useRuns, etc.)
  types.ts                   # All TypeScript interfaces
  utils.ts                   # formatCost, formatTokens, timeAgo, cn, etc.
  roles.ts                   # 7 role lane definitions with colors and suggested automations
  execution-policy.ts        # Model tier routing logic
  task-recommender.ts        # Smart task→role→agent recommendation
  workflow-chains.ts         # Predefined workflow templates
  workflow-orchestrator.ts   # Auto-advance workflows on run completion
  project-store.ts           # Disk persistence for dashboard-owned data
  project-context.tsx        # Active project context (React context + localStorage)
  project-mapper.ts          # Session→project mapping
  costs.ts                   # Model pricing and tier utilities
  mock-data.ts               # All empty arrays (no mock data)
  bridge/                    # Legacy OpenClaw bridge (unused, kept for reference)

types/
  claude-code.d.ts           # Type declarations for @anthropic-ai/claude-code SDK
```

## Patterns

- `useApi<T>(fetcher, fallback, deps, refetchInterval?)` — generic data-fetching hook with optional polling
- API routes: `export const dynamic = 'force-dynamic'`, CORS headers, JSON responses
- Animations: `motion.div` with stagger delays capped at 0.5s
- Cards: `bg-card border border-border rounded-xl` with `card-glow` class
- Status colors: `text-status-running`, `text-status-success`, `text-status-failed`, etc.
- Role colors defined in `lib/roles.ts`
- Chat: `sendChatMessage()` → `POST /api/chat` → `agent-runtime.startConversation()` (conversational, no auto-task)
- Task creation: Agent identifies work → outputs `[TASK: title="..." priority="..." description="..."]` → parsed by runtime → appears in Backlog
- All cost values prefixed with "Est." (estimated from token counts)
- Empty states: descriptive text + relevant icon at 30% opacity
- No mock/demo data anywhere — store always starts empty

## Current Status

### Architecture (Completed)
- **Project-centric workspace**: Chat, Boards, Activity are tabs inside each project (not standalone pages)
- Sidebar: Mission Control / Projects / Approvals / Run Inspector + Manage section
- /chats and /boards routes redirect to /projects (backwards compatible)
- Toast notification system (Framer Motion + React context)
- Unified ModelTier: economy / standard / premium (no more cheap/mid/local)
- Full ESLint/TypeScript audit: 0 errors, 0 warnings, 65/65 tests passing

### Remaining Backlog
1. **Run action buttons**: Retry, Pause, Stop handlers need wiring
2. **Approval persistence**: Decisions are component-local state (not persisted to store)
3. **Usage page time range**: 7d/30d/All filter buttons non-functional
4. **Chat pagination**: Load more messages in conversation thread
5. **Multi-agent per project**: Allow multiple role-specific agents with smart allocation

## Development Notes

- GitHub repo: `amangarg2310/Mission-Control-Dashboard`
- Cloud monorepo path: `openclaw-mission-control/` in `amangarg2310.github.io`
- The bridge/ directory is legacy OpenClaw code — don't modify, don't delete (kept for reference)
- Owner: Aman Garg (amangarg2310)
