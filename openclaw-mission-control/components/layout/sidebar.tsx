'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Play,
  BarChart3,
  Settings,
  Zap,
  Plus,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOnlineAgents, getActiveRuns, getNeedsApproval } from '@/lib/mock-data';

const navigation = [
  { name: 'Mission Control', href: '/', icon: LayoutDashboard },
  { name: 'Chats', href: '/chats', icon: MessageSquare },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Runs', href: '/runs', icon: Play },
  { name: 'Usage', href: '/usage', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const onlineAgents = getOnlineAgents();
  const activeRuns = getActiveRuns();
  const needsApproval = getNeedsApproval();

  return (
    <div className="flex h-full w-56 flex-col border-r border-border bg-[#0c0c0f]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight">OpenClaw</span>
      </div>

      {/* Quick action */}
      <div className="px-3 pt-3">
        <Link
          href="/?newTask=true"
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-md bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New Task
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          // Badge counts
          let badge: number | null = null;
          if (item.href === '/runs' && activeRuns.length > 0) badge = activeRuns.length;
          if (item.href === '/' && needsApproval.length > 0) badge = needsApproval.length;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
              {badge !== null && (
                <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600/30 px-1 text-[10px] font-medium text-blue-300">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Help link */}
      <div className="px-3 pb-1">
        <a
          href="#"
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Getting Started Guide
        </a>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
          <div className="text-xs">
            <div className="font-medium text-foreground">Operator</div>
            <div className="text-muted-foreground">{onlineAgents.length} agents online</div>
          </div>
        </div>
      </div>
    </div>
  );
}
