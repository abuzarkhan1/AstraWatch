import type { ReactNode } from 'react';

// Unified page header — every SaaS product page opens with the same pattern:
// title, one-line subtitle, a live meta chip, and an actions slot on the right.
// Previously every page hand-rolled this with inconsistent spacing.
export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Small live chip rendered next to the title (e.g. "12 services"). */
  meta?: ReactNode;
  /** Right-aligned action cluster (buttons, filters, links). */
  actions?: ReactNode;
  /** Optional extra row under the header (filter bars, tabs). */
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
            {meta}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function LiveBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
      </span>
      {children}
    </span>
  );
}

export function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-medium text-gray-400">
      {children}
    </span>
  );
}
