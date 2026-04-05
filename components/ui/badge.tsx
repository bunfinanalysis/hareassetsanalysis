import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium tracking-[0.02em] transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-primary/10 bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(216,168,77,0.08)]",
        secondary: "border-white/8 bg-white/6 text-foreground",
        outline: "border-white/10 bg-transparent text-foreground",
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

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
