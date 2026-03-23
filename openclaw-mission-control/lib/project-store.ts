/**
 * Disk persistence for dashboard-owned project data.
 *
 * Projects and role assignments are NOT part of the bridge sync cycle.
 * They persist to <stateDir>/dashboard/projects.json and survive restarts.
 *
 * In demo mode (no stateDir): returns mock data, skips disk writes.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import type { Project, RoleAssignment } from './types'

export interface ProjectData {
  projects: Project[]
  roleAssignments: RoleAssignment[]
}

function getProjectFilePath(stateDir: string): string {
  return join(stateDir, 'dashboard', 'projects.json')
}

export function loadProjectData(stateDir: string | null): ProjectData | null {
  if (!stateDir) return null

  const filePath = getProjectFilePath(stateDir)
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as ProjectData
    if (!Array.isArray(data.projects) || !Array.isArray(data.roleAssignments)) {
      return null
    }
    return data
  } catch {
    return null
  }
}

export function saveProjectData(stateDir: string | null, data: ProjectData): void {
  if (!stateDir) return

  const filePath = getProjectFilePath(stateDir)
  const dir = dirname(filePath)

  // Ensure directory exists
  mkdirSync(dir, { recursive: true })

  // Atomic write: write to .tmp, then rename
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}
