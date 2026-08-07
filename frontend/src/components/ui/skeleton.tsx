// Skeleton loading primitive — the missing "loading" layer that made every
// page flash a bare "Loading..." text node. Matches the glass card system.
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-neutral-800/70 border border-neutral-800/60 ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
      <Skeleton className="h-8 w-2/3" />
    </div>
  );
}

