// Placeholder rows shown while the company list loads. The widths alternate so the
// list doesn't read as a uniform block.
const ROW_WIDTHS = [52, 40, 60, 35, 50, 45];

function SkeletonRow({ wide }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-5 px-4 py-3 rounded-lg border bg-background animate-pulse">
      <div className={`h-3 bg-muted rounded ${wide ? 'w-56' : 'w-40'}`} />
      <div className="h-2.5 bg-muted rounded w-32 hidden sm:block" />
      <div className="ml-auto h-2.5 bg-muted rounded w-14" />
    </div>
  );
}

export function CompanyListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {ROW_WIDTHS.map((w, i) => (
        <SkeletonRow key={i} wide={w > 48} />
      ))}
    </div>
  );
}
