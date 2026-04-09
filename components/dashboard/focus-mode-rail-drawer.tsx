"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FocusModeRailDrawerProps = {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
};

export function FocusModeRailDrawer({
  children,
  isOpen,
  onClose,
  title = "Analysis Rail",
}: FocusModeRailDrawerProps) {
  return (
    <div
      aria-hidden={!isOpen}
      className="pointer-events-none fixed inset-0 z-40"
    >
      <button
        type="button"
        aria-label="Close analysis rail"
        className={cn(
          "absolute inset-0 backdrop-blur-[1px] transition-opacity duration-200",
          isOpen
            ? "pointer-events-auto bg-[rgba(4,7,15,0.38)] opacity-100"
            : "opacity-0",
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          "absolute inset-y-2.5 right-2.5 flex w-[min(388px,calc(100vw-1.25rem))] flex-col transition-all duration-200 ease-out",
          isOpen
            ? "translate-x-0 opacity-100"
            : "translate-x-[108%] opacity-0",
        )}
      >
        <div className="mb-1.5 flex items-center justify-between rounded-[18px] border border-white/8 bg-[rgba(6,11,21,0.86)] px-3 py-2 shadow-[0_24px_64px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Focus Overlay
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto h-7 px-2.5 text-[11px]"
            onClick={onClose}
          >
            {isOpen ? (
              <PanelRightClose className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
            )}
            Hide Rail
          </Button>
        </div>

        <div className="pointer-events-auto min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
