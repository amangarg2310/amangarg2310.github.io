'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Activity,
  MessageSquare,
  Bot,
  BarChart3,
  Settings,
  TerminalSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOnlineAgents, getActiveRuns, getNeedsApproval } from '@/lib/mock-data'

const navigation = [
  { name: 'Mission Control', href: '/', icon: LayoutDashboard },
  { name: 'Run Inspector', href: '/runs', icon: Activity },
  { name: 'Chat Workspace', href: '/chats', icon: MessageSquare },
  { name: 'Agent Registry', href: '/agents', icon: Bot },
  { name: 'Usage & Cost', href: '/usage', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const onlineAgents = getOnlineAgents()
  const activeRuns = getActiveRuns()
  const needsApproval = getNeedsApproval()

  return (
    <aside className="w-64 h-screen flex flex-col bg-[#050506] border-r border-border flex-shrink-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-3 text-foreground font-semibold tracking-wide">
          <div className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center border border-accent/20">
            <TerminalSquare className="w-5 h-5 text-accent" />
          </div>
          OpenClaw
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          const Icon = item.icon

          let badge: number | null = null
          if (item.href === '/runs' && activeRuns.length > 0) badge = activeRuns.length
          if (item.href === '/' && needsApproval.length > 0) badge = needsApproval.length

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]',
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
                <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent/20 px-1 text-[10px] font-medium text-accent">
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-border/50">
        <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
            JD
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-foreground">
              John Doe
            </span>
            <span className="text-xs text-muted-foreground">
              {onlineAgents.length} agents online
            </span>
          </div>
        </button>
      </div>
    </aside>
  )
}
