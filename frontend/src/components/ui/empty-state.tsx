import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Onboarding empty state — the pattern every observability SaaS uses when a
// workspace has no data yet. Instead of a dead "No data" line, guide the user
// to the next setup step. Steps render as a checklist that links into the real
// product pages (all of which exist in this app).
export interface OnboardingStep {
  title: string;
  description: string;
  href: string;
  cta: string;
  /** Optional indicator the step is already done (e.g. has services). */
  done?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  steps,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  steps?: OnboardingStep[];
  /** Single CTA replacing the checklist (used for search/filter misses). */
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/50 p-10 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-gray-500">{description}</p>

      {action && <div className="mt-6 flex justify-center">{action}</div>}

      {steps && steps.length > 0 && (
        <div className="mx-auto mt-8 max-w-lg space-y-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Get started
          </p>
          {steps.map((step, i) => (
            <Link
              key={step.href}
              to={step.href}
              className="group flex items-start gap-4 rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 transition-colors hover:border-blue-500/40 hover:bg-neutral-900"
            >
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                    : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                }`}
              >
                {step.done ? '✓' : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                    {step.title}
                  </p>
                  <span className="text-xs font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                    {step.cta} →
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{step.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
