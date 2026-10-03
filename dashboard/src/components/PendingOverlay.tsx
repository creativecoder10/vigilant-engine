"use client";

import type { ReactNode } from "react";
import { usePendingNav } from "@/lib/navigation-pending";

/**
 * Wraps the filter cards + table: dims them and shows a spinner while a
 * filter click is re-fetching from the API, so a slow/cold-starting backend
 * (see PHASE12 notes) reads as "working" rather than "broken."
 */
export function PendingOverlay({ children }: { children: ReactNode }) {
  const { isPending } = usePendingNav();

  return (
    <div className="relative">
      <div
        aria-busy={isPending}
        className={`flex flex-col gap-6 transition-opacity duration-150 sm:gap-8 ${
          isPending ? "pointer-events-none opacity-40" : "opacity-100"
        }`}
      >
        {children}
      </div>
      {isPending ? (
        <div className="absolute inset-0 flex items-start justify-center pt-16">
          <span
            role="status"
            aria-label="Updating findings"
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--ink-muted)", borderTopColor: "transparent" }}
          />
        </div>
      ) : null}
    </div>
  );
}
