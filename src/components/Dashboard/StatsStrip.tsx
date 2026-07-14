function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span>
      <span className={`font-medium ${className ?? ''}`}>{value}</span>
      <span className="text-muted-foreground ml-1">{label}</span>
    </span>
  );
}

function Separator() {
  return <span className="text-muted-foreground/25 select-none">·</span>;
}

export function StatsStrip({
  count,
  total,
  urgent,
  important,
}: {
  count: number;
  total: number;
  urgent: number;
  important: number;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] tabular-nums">
      <Stat value={count} label="companies" />
      <Separator />
      <Stat value={total} label="open tasks" />
      {urgent > 0 && (
        <>
          <Separator />
          <Stat value={urgent} label="25d overdue" className="text-purple-600" />
        </>
      )}
      {important > 0 && (
        <>
          <Separator />
          <Stat value={important} label="important" className="text-amber-600" />
        </>
      )}
    </div>
  );
}
