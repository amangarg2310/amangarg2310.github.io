'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type StatusType =
  | 'success'
  | 'running'
  | 'approval'
  | 'failed'
  | 'model'
  | 'tool'
  | 'completed'
  | 'needs_approval'
  | 'queued'
  | 'waiting'
  | 'paused'
  | 'stalled'
  | 'active'
  | 'inactive'
  | 'busy'
  | 'idle'

const statusConfig: Record<
  string,
  { label: string; color: string; bgClass: string }
> = {
  success: { label: 'Completed', color: '#10b981', bgClass: 'bg-status-success' },
  completed: { label: 'Completed', color: '#10b981', bgClass: 'bg-status-success' },
  running: { label: 'Running', color: '#3b82f6', bgClass: 'bg-status-running' },
  approval: { label: 'Needs Approval', color: '#f59e0b', bgClass: 'bg-status-approval' },
  needs_approval: { label: 'Needs Approval', color: '#f59e0b', bgClass: 'bg-status-approval' },
  failed: { label: 'Failed', color: '#ef4444', bgClass: 'bg-status-failed' },
  model: { label: 'Model', color: '#a855f7', bgClass: 'bg-status-model' },
  tool: { label: 'Tool', color: '#06b6d4', bgClass: 'bg-status-tool' },
  queued: { label: 'Queued', color: '#71717a', bgClass: 'bg-zinc-500' },
  waiting: { label: 'Waiting', color: '#eab308', bgClass: 'bg-yellow-500' },
  paused: { label: 'Paused', color: '#f97316', bgClass: 'bg-orange-500' },
  stalled: { label: 'Stalled', color: '#fca5a5', bgClass: 'bg-red-300' },
  active: { label: 'Active', color: '#10b981', bgClass: 'bg-status-success' },
  inactive: { label: 'Inactive', color: '#71717a', bgClass: 'bg-zinc-500' },
  busy: { label: 'Busy', color: '#3b82f6', bgClass: 'bg-status-running' },
  idle: { label: 'Idle', color: '#94a3b8', bgClass: 'bg-slate-400' },
}

interface StatusBadgeProps {
  status: StatusType | string
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({
  status,
  label,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.queued
  const isRunning = status === 'running' || status === 'busy'
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex items-center justify-center">
        {isRunning && (
          <div
            className={cn('absolute rounded-full led-pulse', dotSize, config.bgClass)}
          />
        )}
        <div
          className={cn('rounded-full relative z-10', dotSize, config.bgClass)}
          style={{ boxShadow: `0 0 8px ${config.color}80` }}
        />
      </div>
      {label && (
        <span
          className={cn(
            textSize,
            'font-medium text-muted-foreground uppercase tracking-wider'
          )}
        >
          {label}
        </span>
      )}
    </div>
  )
}

// Full badge with label (used in places that need the old pill style)
export function StatusPill({
  status,
  size = 'sm',
  className,
}: {
  status: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const config = statusConfig[status] || statusConfig.queued
  const isRunning = status === 'running' || status === 'busy' || status === 'stalled'
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        `bg-[${config.color}]/10 text-[${config.color}] border-[${config.color}]/20`,
        className
      )}
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
        borderColor: `${config.color}33`,
      }}
    >
      <span
        className={cn('rounded-full', dotSize, isRunning && 'animate-pulse')}
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  )
}
