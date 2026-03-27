# Mission Control

Project-centric founder operating system powered by Claude Code SDK. Manages multiple early-stage startup workstreams (ScoutAI, Fetchly, Heritage, etc.) through 7 role lanes with smart task routing, workflow automation, and execution policy.

## Vision

One dashboard to consolidate all projects. Within each project, different agents with different roles. Track what each is working on, have agents collaborate and strategize based on findings. Chat interface routes new tasks to the right agents automatically.

## Tech Stack

Next.js 16, React 19, TypeScript, TailwindCSS 4, Framer Motion, Radix UI, Recharts, @anthropic-ai/claude-code (Agent SDK)

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

- Agents spawned via Claude Agent SDK (`@anthropic-ai/claude-code`) `query()` function
- Uses existing Claude Code login — NO API key needed
- Full tool access: Read, Write, Bash, Grep, WebFetch, WebSearch, etc.
- Multi-agent support via subagent definitions per role
- Role-based system prompts in `ROLE_PROMPTS` map
- Active sessions tracked in `activeSessions` Map (keyed by run ID)
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
  boards/page.tsx             # Kanban board (Backlog/In Progress/Review/Done)
  runs/page.tsx               # Run inspector table with filters/search
  chats/page.tsx              # Chat workspace (3-panel: list, thread, details)
  activity/page.tsx           # Activity timeline with date headers
  approvals/page.tsx          # Approval queue for human oversight
  settings/page.tsx           # Model providers, budgets, pricing
  usage/page.tsx              # Usage & cost dashboard
  projects/page.tsx           # Project grid with status breakdown
  projects/[id]/page.tsx      # Project command center (7 role lanes)
  api/chat/route.ts           # POST: send message, spawn agent
  api/agents/route.ts         # GET: list agents
  api/tasks/route.ts          # GET/POST: list/create tasks
  api/runs/route.ts           # GET: list runs
  api/conversations/          # GET: list/detail conversations
  api/projects/[id]/          # CRUD + command-center, roles, automations, workflows, recommend

components/
  dashboard/                  # Dashboard widgets (model-usage-chart, getting-started, run-status-board, team-view, activity-feed, create-task-modal)
  project/                    # Command center (role-lane-card, blockers-banner, workflow-status)
  layout/                     # Sidebar navigation
  ui/                         # Reusable primitives (status-badge, agent-avatar, model-badge, tooltip, page-header)

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
  project-mapper.ts          # Session→project mapping
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
- Chat: `sendChatMessage()` → `POST /api/chat` → `agent-runtime.spawnAgentRun()`
- All cost values prefixed with "Est." (estimated from token counts)
- Empty states: descriptive text + relevant icon at 30% opacity
- No mock/demo data anywhere — store always starts empty

## Current Status & Remaining Work

### Completed
- Replaced OpenClaw backend with Claude Code Agent SDK
- Dashboard components use real data from hooks (not hardcoded)
- Chat composer sends real messages (was disabled)
- All OpenClaw references removed from UI
- Projects page: status breakdown bar, blocked indicators, last activity
- Runs page: project context, working search, smart sort
- Activity page: date headers, clickable run links
- Chat sidebar: sorted by recency, agent avatars, active LED
- Trust labeling: "Est." on all costs, honest empty states

### Remaining Backlog (8 items)
1. **Settings page**: Separate default model from available providers, show "no API key needed" clearly
2. **Boards as real backlog**: Make all 4 columns (Backlog/In Progress/Review/Done) functional
3. **Extend backlog to project/role views**: Per-project and per-role task boards
4. **Smart model recommendation**: Recommend model based on task type, show reasoning
5. **Model override UI**: Let users override recommended model per task
6. **Cost-efficient routing**: Bias toward cheapest acceptable model by default
7. **Multi-agent per project**: Allow multiple role-specific agents with smart allocation
8. **Full audit & UX pass**: Button handlers, pagination, error states, type safety

### Known Issues from Audit
- Run action buttons (Retry, Pause, Stop) have no onClick handlers
- Approval decisions are component-local state (not persisted)
- Usage page time range buttons (7d/30d/All) are non-functional
- Team view only shows first task's pipeline
- Getting-started steps 1 & 2 are redundant
- `execution-policy.ts` still has a 'local' tier that doesn't map to any real model
- Project delete uses `window.location.reload()` instead of optimistic update
- Chat transcript pagination (load more) not implemented

## Development Notes

- Branch: `claude/openclaw-mission-control-GuJE2`
- All changes go in this one branch (user's explicit instruction)
- The bridge/ directory is legacy OpenClaw code — don't modify, don't delete (kept for reference)
- Owner: Aman Garg (amangarg2310)
- Projects being managed: ScoutAI, Fetchly, Heritage, and others
