'use client';

import { getRecentActivity } from '@/lib/mock-data';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

const typeStyles: Record<string, string> = {
  started: 'border-blue-500/30',
  completed: 'border-emerald-500/30',
  failed: 'border-red-500/30',
  needs_approval: 'border-amber-500/30',
  stalled: 'border-red-400/30',
};

const dotStyles: Record<string, string> = {
  started: 'bg-blue-400',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
  needs_approval: 'bg-amber-400',
  stalled: 'bg-red-300',
};

export function ActivityFeed() {
  const activity = getRecentActivity();

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium">Recent Activity</h3>
      </div>
      <div className="divide-y divide-border">
        {activity.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 border-l-2',
              typeStyles[item.type] || 'border-zinc-500/30'
            )}
          >
            <span
              className={cn(
                'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                dotStyles[item.type] || 'bg-zinc-400'
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-foreground leading-snug">{item.text}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(item.time)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
