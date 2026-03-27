# Mission Control Skills

## audit-page
When asked to audit a page, read the full page file and all components it imports. Check for:
- Stale OpenClaw references
- Non-functional buttons (no onClick handler)
- Hardcoded data that should come from hooks
- Missing empty states
- Type mismatches with lib/types.ts
- UX issues (pagination, error handling, loading states)

## spawn-agent
To spawn a Claude agent from the dashboard:
1. Create a task via `store.upsertTask()`
2. Call `spawnAgentRun()` from `lib/agent-runtime.ts`
3. This calls `query()` from `@anthropic-ai/claude-code` SDK
4. Uses existing Claude Code login (no API key)
5. Run + Conversation records created in store automatically

## add-role-lane
To add a new role lane:
1. Add entry to `ROLE_DEFINITIONS` in `lib/roles.ts`
2. Add to `RoleLane` type union in `lib/types.ts`
3. Add system prompt to `ROLE_PROMPTS` in `lib/agent-runtime.ts`
4. Add tier defaults to `lib/execution-policy.ts`

## create-api-route
All API routes follow this pattern:
```typescript
import { store } from '@/lib/store'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Read from store
  return Response.json(data, { headers: corsHeaders })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
```
