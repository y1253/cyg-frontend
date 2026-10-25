import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** One figure at the top of the Costs tab; with `onClick` it doubles as a filter button. */
export function CostStat({
  icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <CardContent className="flex items-center gap-3 p-4">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)}>{icon}</span>
      <div className="min-w-0 text-left">
        <p className="truncate text-xl leading-tight font-semibold tabular-nums">{value}</p>
        <p className="text-muted-foreground truncate text-xs">{label}</p>
      </div>
    </CardContent>
  );
  return (
    <Card className={cn('py-0 transition-shadow', active && 'ring-primary ring-2', onClick && 'hover:shadow-md')}>
      {onClick ? (
        <button type="button" onClick={onClick} className="w-full rounded-xl" aria-pressed={active}>
          {body}
        </button>
      ) : (
        body
      )}
    </Card>
  );
}
