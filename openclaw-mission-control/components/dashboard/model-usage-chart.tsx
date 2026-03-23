'use client';

import { modelUsage } from '@/lib/mock-data';
import { formatCost } from '@/lib/utils';
import { getTierLabel } from '@/lib/costs';
import { cn } from '@/lib/utils';

const tierBarColors: Record<string, string> = {
  cheap: 'bg-emerald-500',
  mid: 'bg-blue-500',
  premium: 'bg-amber-500',
};

const tierTextColors: Record<string, string> = {
  cheap: 'text-emerald-400',
  mid: 'text-blue-400',
  premium: 'text-amber-400',
};

export function ModelUsageChart() {
  const totalCost = modelUsage.reduce((sum, m) => sum + m.estimated_cost, 0);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium">Model Usage (7 days)</h3>
      </div>
      <div className="p-4 space-y-3">
        {modelUsage.map((m) => (
          <div key={m.model} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-mono">{m.model}</span>
                <span className={cn('text-[10px] font-medium', tierTextColors[m.tier])}>
                  {getTierLabel(m.tier)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">{m.percentage}%</span>
                <span className="text-[11px] font-medium">{formatCost(m.estimated_cost)}</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/5">
              <div
                className={cn('h-full rounded-full transition-all', tierBarColors[m.tier])}
                style={{ width: `${m.percentage}%` }}
              />
            </div>
          </div>
        ))}
        <div className="pt-2 mt-2 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total (7d)</span>
          <span className="text-sm font-semibold">{formatCost(totalCost)}</span>
        </div>
      </div>
    </div>
  );
}
