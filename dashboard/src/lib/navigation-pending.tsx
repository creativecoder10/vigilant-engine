"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface PendingNav {
  isPending: boolean;
  navigate: (url: string) => void;
}

const PendingNavContext = createContext<PendingNav | null>(null);

/**
 * Shared router.push() + isPending, so every filter control (severity cards,
 * scanner dropdown) can trigger navigation and a single overlay elsewhere on
 * the page can show a spinner while the new searchParams are server-rendered.
 * Wrapping router.push in startTransition makes isPending stay true until
 * the new page content actually arrives, not just until the URL changes.
 */
export function PendingNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(url: string) {
    startTransition(() => {
      router.push(url);
    });
  }

  return <PendingNavContext.Provider value={{ isPending, navigate }}>{children}</PendingNavContext.Provider>;
}

export function usePendingNav(): PendingNav {
  const context = useContext(PendingNavContext);
  if (!context) {
    throw new Error("usePendingNav must be used within a PendingNavProvider");
  }
  return context;
}

/**
 * Shared by every control that sets a single query-param filter (severity
 * cards, scanner dropdown, the findings table's severity/source column
 * filters) - same URLSearchParams-patch-and-navigate logic, one place.
 */
export function useUrlFilter(): (key: string, value: string | null) => void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = usePendingNav();

  return function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const query = params.toString();
    navigate(query ? `${pathname}?${query}` : pathname);
  };
}
