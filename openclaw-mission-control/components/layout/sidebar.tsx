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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

  return (
    <div className="flex h-full w-56 flex-col border-r border-border bg-[#0c0c0f]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight">OpenClaw</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

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
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
          <div className="text-xs">
            <div className="font-medium text-foreground">Operator</div>
            <div className="text-muted-foreground">5 agents online</div>
          </div>
        </div>
      </div>
    </div>
  );
}
