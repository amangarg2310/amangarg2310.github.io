import { cn } from '@/lib/utils';
import { getModelTier, getTierColor } from '@/lib/costs';

interface ModelBadgeProps {
  model: string;
  className?: string;
}

export function ModelBadge({ model, className }: ModelBadgeProps) {
  const tier = getModelTier(model);
  const tierColor = getTierColor(tier);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-mono font-medium bg-white/5 border border-white/10',
        tierColor,
        className
      )}
    >
      {model}
    </span>
  );
}
