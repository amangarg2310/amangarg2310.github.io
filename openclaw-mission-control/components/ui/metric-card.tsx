import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-muted-foreground',
  trend,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card/80',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn('h-4 w-4', iconColor)} />
      </div>
      <div className="mt-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {trend && (
          <span
            className={cn(
              'ml-2 text-xs font-medium',
              trend.positive ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
