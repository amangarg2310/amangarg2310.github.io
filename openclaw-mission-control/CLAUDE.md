# OpenClaw Mission Control

Project-centric founder operating system built on top of OpenClaw. Manages multiple early-stage startup workstreams through 7 role lanes with smart task routing, workflow automation, and execution policy.

## Tech Stack

Next.js 16, React 19, TypeScript, TailwindCSS 4, Framer Motion, Radix UI, Recharts, Zustand

## Key Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
npm run test      # Bridge layer tests (35 tests)
npm run validate  # Bridge validation script
```

## Architecture

### Store

- Always starts empty — no mock/demo data
- Runtime data hydrated every 15s by `lib/sync.ts` from local OpenClaw CLI
- Set `OPENCLAW_STATE_DIR` to enable sync from your local OpenClaw installation

### Data Ownership

- **Bridge-sourced** (agents, runs, conversations): Replaced atomically by `store.replaceAll()` each sync cycle. Never modify these directly.
- **Dashboard-owned** (projects, role assignments, automation configs, workflow instances): Persisted to `<stateDir>/dashboard/projects.json`. Never touched by `replaceAll()`.

### Data Flow

```
OpenClaw CLI → lib/bridge/* → lib/runtime-adapter.ts → lib/sync.ts → lib/store.ts
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

Each project has 7 role lanes, each mappable to an OpenClaw agent:

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

- **Execution Policy** (`lib/execution-policy.ts`): Role-based model routing. Recommends tier (local/economy/standard/premium) based on role, urgency, and cost/quality tradeoff.
- **Task Recommender** (`lib/task-recommender.ts`): Infers best role from goal keywords, finds assigned agent, recommends tier/autonomy/model/chain.
- **Workflow Chains** (`lib/workflow-chains.ts`): Predefined handoff patterns (Research→Strategy, full GTM pipeline, etc.)
- **Workflow Orchestrator** (`lib/workflow-orchestrator.ts`): Runs post-sync. When a step's run completes, auto-creates queued task for next step.
- **Project Mapper** (`lib/project-mapper.ts`): Auto-tags OpenClaw sessions to projects via transcript CWD matching.

## File Structure

```
app/
  page.tsx                    # Dashboard
  projects/page.tsx           # Project list
  projects/[id]/page.tsx      # Project command center
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
  store.ts                   # Singleton data store (server-only)
  sync.ts                    # Periodic sync from OpenClaw
  bridge/                    # OpenClaw CLI access layer (DO NOT MODIFY)
  runtime-adapter.ts         # Bridge → store normalization (DO NOT MODIFY)
  project-mapper.ts          # Session → project mapping (DO NOT MODIFY)
```

## Do NOT Modify

The bridge layer is stable and tested. Do not modify these files unless fixing a bridge-specific bug:
- `lib/bridge/*` (cli.ts, transcript.ts, normalizer.ts, raw-types.ts, state-resolver.ts)
- `lib/runtime-adapter.ts`
- `lib/project-mapper.ts`

## Patterns

- Use `useApi<T>()` generic hook for data fetching
- API routes: `export const dynamic = 'force-dynamic'`, CORS headers, JSON responses
- Animations: `motion.div` with stagger delays
- Cards: `bg-card border border-border rounded-xl` with `card-glow` class
- Colors: role lanes have assigned colors in `lib/roles.ts`
