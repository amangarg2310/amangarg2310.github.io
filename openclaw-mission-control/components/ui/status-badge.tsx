import { cn } from '@/lib/utils';
import { TaskStatus, RunStatus } from '@/lib/types';

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  queued: { label: 'Queued', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', dot: 'bg-zinc-400' },
  running: { label: 'Running', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
  waiting: { label: 'Waiting', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', dot: 'bg-yellow-400' },
  needs_approval: { label: 'Needs Approval', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400 animate-pulse' },
  failed: { label: 'Failed', color: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-400' },
  completed: { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  paused: { label: 'Paused', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', dot: 'bg-orange-400' },
  stalled: { label: 'Stalled', color: 'bg-red-500/10 text-red-300 border-red-500/20', dot: 'bg-red-300 animate-pulse' },
  active: { label: 'Active', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  inactive: { label: 'Inactive', color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', dot: 'bg-zinc-500' },
  busy: { label: 'Busy', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
};

interface StatusBadgeProps {
  status: TaskStatus | RunStatus | 'active' | 'inactive' | 'busy';
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.queued;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        config.color,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  );
}
