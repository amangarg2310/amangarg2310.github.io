'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Activity,
  Bot,
  BarChart3,
  Settings,
  ShieldCheck,
  Clock,
  Search,
  Command,
  FolderKanban,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarStats, useProjects } from '@/lib/hooks'
import { useActiveProject } from '@/lib/project-context'
import { useState, useRef, useEffect } from 'react'

const mainNav = [
  { name: 'Mission Control', href: '/', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Approvals', href: '/approvals', icon: ShieldCheck },
  { name: 'Run Inspector', href: '/runs', icon: Activity },
]

const manageNav = [
  { name: 'Agent Registry', href: '/agents', icon: Bot },
  { name: 'Activity Log', href: '/activity', icon: Clock },
  { name: 'Usage & Cost', href: '/usage', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { activeRunCount, approvalCount, onlineAgentCount } = useSidebarStats()
  const { data: projects } = useProjects()
  const { activeProjectId, setActiveProjectId } = useActiveProject()
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)

  // Close project menu on click outside
  useEffect(() => {
    if (!showProjectMenu) return
    const handler = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProjectMenu])

  const activeProject = projects.find((p) => p.id === activeProjectId)

  function getBadge(href: string): number | null {
    if (href === '/runs' && activeRunCount > 0) return activeRunCount
    if (href === '/approvals' && approvalCount > 0) return approvalCount
    return null
  }

  function renderNavItem(item: { name: string; href: string; icon: React.ElementType }) {
    const isActive =
      item.href === '/'
        ? pathname === '/'
        : pathname.startsWith(item.href)
    const Icon = item.icon
    const badge = getBadge(item.href)

    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]',
          isActive
            ? 'bg-accent/10 text-accent border-l-2 border-accent rounded-l-sm'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground border-l-2 border-transparent rounded-l-sm'
        )}
      >
        <Icon
          className={cn(
            'w-4 h-4',
            isActive ? 'text-accent' : 'text-muted-foreground'
          )}
        />
        {item.name}
        {badge !== null && (
          <span
            className={cn(
              'ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium',
              item.href === '/approvals'
                ? 'bg-status-approval/20 text-status-approval'
                : 'bg-accent/20 text-accent'
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside className="w-64 h-screen flex flex-col bg-[#050506] border-r border-border flex-shrink-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-3 text-foreground font-semibold tracking-wide">
          <div className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center border border-accent/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent">
              <path d="M6 4C6 4 3 8 3 12C3 14 4 15.5 6 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M10 4C10 4 7 8 7 12C7 14 8 15.5 10 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M18 4C18 4 21 8 21 12C21 14 20 15.5 18 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M14 4C14 4 17 8 17 12C17 14 16 15.5 14 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M6 20L12 16L18 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          Mission Control
        </div>
      </div>

      {/* Project Switcher */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative" ref={projectMenuRef}>
          <button
            onClick={() => setShowProjectMenu(!showProjectMenu)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-white/[0.02] text-sm hover:border-accent/30 hover:bg-white/[0.04] transition-all"
          >
            {activeProject ? (
              <>
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: activeProject.color }}
                />
                <span className="flex-1 text-left text-foreground truncate text-xs font-medium">
                  {activeProject.name}
                </span>
              </>
            ) : (
              <span className="flex-1 text-left text-muted-foreground text-xs">
                All Projects
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>

          {showProjectMenu && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              <button
                onClick={() => { setActiveProjectId(null); setShowProjectMenu(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors',
                  !activeProjectId ? 'text-accent bg-accent/5' : 'text-muted-foreground'
                )}
              >
                All Projects
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProjectId(p.id); setShowProjectMenu(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors',
                    activeProjectId === p.id ? 'text-accent bg-accent/5' : 'text-foreground'
                  )}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-3 pt-2 pb-2">
        <button
          onClick={() => {
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', metaKey: true })
            )
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-white/[0.02] text-muted-foreground text-sm hover:border-accent/30 hover:bg-white/[0.04] transition-all"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left text-xs">Search...</span>
          <kbd className="text-[10px] bg-white/5 border border-border px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
        <div className="space-y-0.5">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Workspace (v2)
          </div>
          {mainNav.map(renderNavItem)}
        </div>

        <div className="space-y-0.5">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Manage
          </div>
          {manageNav.map(renderNavItem)}
        </div>
      </nav>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-border/50">
        <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-blue-600 flex items-center justify-center text-white text-xs font-bold">
            MC
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-foreground">
              Mission Control
            </span>
            <span className="text-xs text-muted-foreground">
              {onlineAgentCount} agents online
            </span>
          </div>
        </button>
      </div>
    </aside>
  )
}
