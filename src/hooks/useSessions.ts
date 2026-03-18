import useSWR from "swr";
import { usePathname } from "next/navigation";
import { ClaudeSession } from "@/lib/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import { useRef } from "react";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useSessions() {
  const pathname = usePathname();
  const isOnDashboard = pathname === "/";
  const hooksActiveRef = useRef(false);

  const { data, error, isLoading, mutate } = useSWR<{ sessions: ClaudeSession[]; hooksActive?: boolean }>(
    isOnDashboard ? "/api/sessions" : null,
    fetcher,
    {
      refreshInterval: POLL_INTERVAL_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  if (data?.hooksActive !== undefined) {
    hooksActiveRef.current = data.hooksActive;
  }

  return {
    sessions: data?.sessions ?? [],
    hooksActive: hooksActiveRef.current,
    error,
    isLoading,
    refresh: mutate,
  };
}
