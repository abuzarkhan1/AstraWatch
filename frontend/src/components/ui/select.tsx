import * as React from 'react';
import { cn } from '@/lib/utils';
import { DownChevron } from '@/components/ui/down-chevron';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            'flex h-10 w-full appearance-none rounded-xl border border-white/10 backdrop-blur-xl bg-neutral-950/40 px-3 py-2 pr-8 text-sm text-gray-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.1)] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 transition-all',
            className
          )}
          ref={ref}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <DownChevron className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
      </div>
    );
  }
);
Select.displayName = 'Select';

export { Select };
