'use client';

import { useState } from 'react';
import Link from 'next/link';
import { agents } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import {
  Key,
  Bot,
  ListTodo,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';

const steps = [
  {
    id: 'keys',
    label: 'Set up API keys',
    description: 'Add your OpenAI or Anthropic API key in Settings',
    href: '/settings',
    icon: Key,
    done: true, // mock: keys are configured
  },
  {
    id: 'agents',
    label: 'Create your first agent',
    description: 'Define an AI worker with a role, model, and tools',
    href: '/agents',
    icon: Bot,
    done: agents.length > 0,
  },
  {
    id: 'task',
    label: 'Assign a task',
    description: 'Create a task and let an agent execute it',
    href: '/?newTask=true',
    icon: ListTodo,
    done: false, // mock: no tasks created by user
  },
  {
    id: 'review',
    label: 'Review results',
    description: 'Inspect a completed run and approve or iterate',
    href: '/runs',
    icon: CheckCircle2,
    done: false,
  },
];

export function GettingStarted() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const completedCount = steps.filter(s => s.done).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-medium">Getting Started</h3>
          <span className="text-[10px] text-muted-foreground">{completedCount}/{steps.length}</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-white/10 text-muted-foreground"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="divide-y divide-border">
        {steps.map((step, i) => {
          const StepIcon = step.icon;
          return (
            <Link
              key={step.id}
              href={step.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors',
                step.done ? 'opacity-60' : 'hover:bg-white/[0.02]'
              )}
            >
              <div className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                step.done
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-white/[0.03] border-border text-muted-foreground'
              )}>
                {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn('text-[13px] font-medium', step.done && 'line-through text-muted-foreground')}>{step.label}</div>
                <div className="text-[11px] text-muted-foreground">{step.description}</div>
              </div>
              {!step.done && (
                <span className="text-[11px] text-blue-400 shrink-0">Start →</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
