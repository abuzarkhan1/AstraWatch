import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-blue-600 text-white hover:bg-blue-700",
        secondary:
          "border-white/10 bg-white/[0.07] text-gray-200 hover:bg-white/[0.12] backdrop-blur-md",
        destructive:
          "border-transparent bg-red-600 text-white hover:bg-red-700",
        outline: "border-blue-500/40 bg-blue-500/10 text-blue-400 backdrop-blur-md",
        warning: "border-amber-500/40 bg-amber-500/20 text-amber-300 backdrop-blur-md",
        success: "border-emerald-500/40 bg-emerald-500/20 text-emerald-300 backdrop-blur-md",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
