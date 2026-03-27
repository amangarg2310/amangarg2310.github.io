# Mission Control

Project-centric founder operating system powered by Claude Code SDK. Manages multiple early-stage startup workstreams through 7 role lanes with smart task routing, workflow automation, and execution policy.

## Tech Stack

Next.js 16, React 19, TypeScript, TailwindCSS 4, Framer Motion, Radix UI, Recharts, @anthropic-ai/claude-code (Agent SDK)

## Key Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
npm run test      # Bridge layer tests (35 tests)
```

## Architecture

### Agent Runtime

- Agents are spawned via the Claude Agent SDK (`@anthropic-ai/claude-code`)
- Uses your existing Claude Code login — no API key needed
- Full tool access: Read, Write, Bash, Grep, WebFetch, etc.
- Multi-agent support via subagent definitions per role

### Store

- Always starts empty — no mock/demo data
- Runtime data managed by `lib/agent-runtime.ts`
- Dashboard-owned data (projects, roles) persists to disk

### Data Flow

```
User action (chat/task) → lib/agent-runtime.ts → Claude Agent SDK (query())
                                    ↓
                              lib/store.ts (in-memory)
                                    ↓
                         app/api/* routes (server)
                                    ↓
                         lib/api.ts (client fetch)
                                    ↓
                         lib/hooks.ts (React hooks)
                                    ↓
                         app/ pages + components/
```

### 7 Role Lanes

Each project has 7 role lanes, each mappable to a Claude agent:

| Role | Default Tier | Key Automations |
|------|-------------|-----------------|
| Research | Economy | Trend scan, competitor watch, culture pulse |
| Strategy | Standard | Weekly memo, opportunity/pricing review |
| Product & PMM | Standard | Packaging review, product recommendation memo |
| Content & Marketing | Economy | Content batch planner, copy pipeline, channel recs |
| Performance Marketing | Standard | Campaign optimization, ROAS analysis |
| Consumer Insights | Economy | Review digest, sentiment clustering |
| Advisor | Standard | Founder memo, "what next?" summary, decision memo |

### Key Systems

- **Agent Runtime** (`lib/agent-runtime.ts`): Spawns Claude agents via SDK, manages sessions, tracks runs and conversations.
- **Execution Policy** (`lib/execution-policy.ts`): Role-based model routing. Recommends tier (economy/standard/premium) based on role, urgency, and cost/quality tradeoff.
- **Task Recommender** (`lib/task-recommender.ts`): Infers best role from goal keywords, finds assigned agent, recommends tier/autonomy/model/chain.
- **Workflow Chains** (`lib/workflow-chains.ts`): Predefined handoff patterns (Research→Strategy, full GTM pipeline, etc.)
- **Workflow Orchestrator** (`lib/workflow-orchestrator.ts`): When a step's run completes, auto-creates queued task for next step.

## File Structure

```
app/
  page.tsx                    # Dashboard
  projects/page.tsx           # Project list
  projects/[id]/page.tsx      # Project command center
  api/chat/route.ts           # Chat: send messages, spawn agents
  api/projects/[id]/
    route.ts                  # Project CRUD + focus update
    command-center/route.ts   # Aggregated command center data
    automations/route.ts      # Automation config CRUD
    recommend/route.ts        # Smart task recommendations
    workflows/route.ts        # Workflow instance management
    roles/route.ts            # Role assignment CRUD

components/
  project/                    # Command center components
  dashboard/                  # Dashboard + smart launcher
  ui/                        # Reusable primitives

lib/
  agent-runtime.ts           # Claude Agent SDK wrapper (server-only)
  store.ts                   # Singleton data store (server-only)
  sync.ts                    # Agent status monitoring
  bridge/                    # Legacy OpenClaw bridge (unused, kept for reference)
```

## Patterns

- Use `useApi<T>()` generic hook for data fetching
- API routes: `export const dynamic = 'force-dynamic'`, CORS headers, JSON responses
- Animations: `motion.div` with stagger delays
- Cards: `bg-card border border-border rounded-xl` with `card-glow` class
- Colors: role lanes have assigned colors in `lib/roles.ts`
- Chat: `sendChatMessage()` from `lib/api.ts` → `POST /api/chat` → `agent-runtime.spawnAgentRun()`
