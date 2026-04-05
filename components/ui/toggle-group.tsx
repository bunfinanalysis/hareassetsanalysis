"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleGroupVariants = cva(
  "inline-flex items-center justify-center rounded-xl border border-white/8 bg-white/4 p-1 text-muted-foreground",
);

const toggleGroupItemVariants = cva(
  "inline-flex h-9 min-w-[56px] items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors outline-none hover:bg-white/7 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-[0_12px_28px_rgba(216,168,77,0.18)]",
);

function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(toggleGroupVariants(), className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(toggleGroupItemVariants(), className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
