/**
 * Session-to-project mapper.
 *
 * Dashboard-owned logic that auto-tags live OpenClaw sessions to projects
 * without modifying OpenClaw's native session model.
 *
 * Priority chain:
 *   1. Explicit project_id (if task/run was created from dashboard)
 *   2. Workspace/cwd path match against known project workspace roots
 *   3. Agent-to-project default (if agent is mainly used for one project)
 *   4. Manual override from dashboard/project-mappings.json
 *
 * The mapper runs during sync, after normalization, before replaceAll().
 */

import type { Project, RoleAssignment, Run, Conversation } from './types'
import { basename } from 'path'

export interface ProjectMapping {
  /** Session ID → project ID overrides */
  overrides: Record<string, string>
  /** Workspace path fragments → project ID */
  pathMappings: Record<string, string>
}

/**
 * Build a workspace-path-to-project lookup from projects and their known paths.
 * Uses project slug/name as the folder name to match against workspace paths.
 */
export function buildPathMatcher(projects: Project[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const project of projects) {
    // Match by slug (lowercase folder name)
    map.set(project.slug.toLowerCase(), project.id)
    // Match by name (lowercase)
    map.set(project.name.toLowerCase(), project.id)
  }
  return map
}

/**
 * Try to match a workspace path to a project by checking if the path
 * contains a known project slug or name as a folder component.
 */
export function matchPathToProject(
  workspacePath: string,
  pathMatcher: Map<string, string>
): string | null {
  if (!workspacePath) return null

  // Split path into components and check each
  const parts = workspacePath.toLowerCase().split(/[/\\]/).filter(Boolean)

  // Check from the end (most specific) to the start
  for (let i = parts.length - 1; i >= 0; i--) {
    const match = pathMatcher.get(parts[i])
    if (match) return match
  }

  // Also try the basename specifically
  const base = basename(workspacePath).toLowerCase()
  const baseMatch = pathMatcher.get(base)
  if (baseMatch) return baseMatch

  return null
}

/**
 * Build agent-to-project defaults from role assignments.
 * If an agent is assigned to exactly one project, it defaults to that project.
 */
export function buildAgentDefaults(
  assignments: RoleAssignment[]
): Map<string, string> {
  // Count how many projects each agent is assigned to
  const agentProjects = new Map<string, Set<string>>()
  for (const ra of assignments) {
    let projects = agentProjects.get(ra.agent_id)
    if (!projects) {
      projects = new Set()
      agentProjects.set(ra.agent_id, projects)
    }
    projects.add(ra.project_id)
  }

  // Only return defaults for agents assigned to exactly one project
  const defaults = new Map<string, string>()
  for (const [agentId, projects] of agentProjects) {
    if (projects.size === 1) {
      defaults.set(agentId, [...projects][0])
    }
  }
  return defaults
}

/**
 * Map a run/conversation to a project using the priority chain.
 */
export function resolveProjectId(opts: {
  existingProjectId?: string | null
  agentWorkspace?: string | null
  agentId?: string
  sessionId?: string
  pathMatcher: Map<string, string>
  agentDefaults: Map<string, string>
  overrides: Record<string, string>
}): string | null {
  // 1. Explicit project_id (already set)
  if (opts.existingProjectId) return opts.existingProjectId

  // 2. Manual override by session ID
  if (opts.sessionId && opts.overrides[opts.sessionId]) {
    return opts.overrides[opts.sessionId]
  }

  // 3. Workspace path match
  if (opts.agentWorkspace) {
    const pathMatch = matchPathToProject(opts.agentWorkspace, opts.pathMatcher)
    if (pathMatch) return pathMatch
  }

  // 4. Agent default (if agent is assigned to exactly one project)
  if (opts.agentId) {
    const agentDefault = opts.agentDefaults.get(opts.agentId)
    if (agentDefault) return agentDefault
  }

  return null
}

/**
 * Apply project mapping to arrays of runs and conversations.
 * Mutates in place for efficiency.
 */
export function applyProjectMapping(
  runs: Run[],
  conversations: Conversation[],
  agentWorkspaces: Map<string, string>, // agentId → workspace path
  projects: Project[],
  assignments: RoleAssignment[],
  overrides: Record<string, string> = {}
): void {
  const pathMatcher = buildPathMatcher(projects)
  const agentDefaults = buildAgentDefaults(assignments)

  for (const run of runs) {
    if (!run.project_id) {
      run.project_id = resolveProjectId({
        existingProjectId: run.project_id,
        agentWorkspace: agentWorkspaces.get(run.agent_id) ?? null,
        agentId: run.agent_id,
        sessionId: run.id,
        pathMatcher,
        agentDefaults,
        overrides,
      })
    }
  }

  for (const conv of conversations) {
    if (!conv.project_id) {
      // Find matching run to get agent info
      const run = runs.find((r) => `conv-${r.id}` === conv.id)
      if (run) {
        conv.project_id = run.project_id
      }
    }
  }
}
