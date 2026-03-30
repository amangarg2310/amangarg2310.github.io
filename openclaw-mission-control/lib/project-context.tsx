'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface ProjectContextValue {
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
}

const ProjectCtx = createContext<ProjectContextValue>({
  activeProjectId: null,
  setActiveProjectId: () => {},
})

const STORAGE_KEY = 'oc-active-project'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STORAGE_KEY)
  })
  const hydrated = true

  const setActiveProjectId = (id: string | null) => {
    setActiveProjectIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  // Don't render until hydrated to avoid mismatch
  if (!hydrated) return <>{children}</>

  return (
    <ProjectCtx.Provider value={{ activeProjectId, setActiveProjectId }}>
      {children}
    </ProjectCtx.Provider>
  )
}

export function useActiveProject() {
  return useContext(ProjectCtx)
}
