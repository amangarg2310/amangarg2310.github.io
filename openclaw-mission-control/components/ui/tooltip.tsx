'use client';

import { useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children || <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200 whitespace-nowrap z-50 shadow-lg">
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-700" />
        </span>
      )}
    </span>
  );
}
