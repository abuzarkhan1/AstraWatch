import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl border border-white/10 backdrop-blur-xl bg-neutral-950/40 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.1)] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 transition-all',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
