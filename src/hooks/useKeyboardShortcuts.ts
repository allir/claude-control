"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { ClaudeSession } from "@/lib/types";
import { flattenGroupedSessions } from "@/lib/group-sessions";
import { mutate } from "swr";

interface UseKeyboardShortcutsOptions {
  sessions: ClaudeSession[];
  targetScreen?: number | null;
}

export function useKeyboardShortcuts({ sessions, targetScreen }: UseKeyboardShortcutsOptions) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Use the same grouped+flattened order as the grid renders
  const orderedSessions = useMemo(() => flattenGroupedSessions(sessions), [sessions]);

  // Clamp selection when sessions change
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= orderedSessions.length) {
      setSelectedIndex(orderedSessions.length > 0 ? orderedSessions.length - 1 : null);
    }
  }, [orderedSessions.length, selectedIndex]);

  const selectedSession = selectedIndex !== null ? orderedSessions[selectedIndex] ?? null : null;

  const openAction = useCallback(
    async (action: string, session: ClaudeSession) => {
      try {
        await fetch("/api/actions/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            path: session.workingDirectory,
            pid: session.pid,
            targetScreen: targetScreen ?? undefined,
          }),
        });
      } catch (err) {
        console.error("Action failed:", err);
      }
    },
    [targetScreen]
  );

  const sendKeystroke = useCallback(async (pid: number, keystroke: string) => {
    try {
      await fetch("/api/actions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-keystroke", pid, keystroke }),
      });
      for (const ms of [300, 700, 1200, 2000, 3000]) {
        setTimeout(() => mutate("/api/sessions"), ms);
      }
    } catch (err) {
      console.error("Keystroke failed:", err);
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Number keys 1-9: select session
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < orderedSessions.length) {
          e.preventDefault();
          setSelectedIndex((prev) => (prev === idx ? null : idx));
        }
        return;
      }

      // Escape: deselect
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedIndex(null);
        return;
      }

      // Actions on selected session
      if (selectedSession === null) return;

      switch (e.key.toLowerCase()) {
        case "enter":
          if (selectedSession.pid) {
            e.preventDefault();
            openAction("iterm", selectedSession);
          }
          break;
        case "e":
          e.preventDefault();
          openAction("editor", selectedSession);
          break;
        case "g":
          e.preventDefault();
          openAction("git-gui", selectedSession);
          break;
        case "f":
          e.preventDefault();
          openAction("finder", selectedSession);
          break;
        case "a":
          // Approve: send Enter keystroke if waiting with pending tool use
          if (selectedSession.status === "waiting" && selectedSession.pid && selectedSession.preview.hasPendingToolUse) {
            e.preventDefault();
            sendKeystroke(selectedSession.pid, "return");
          }
          break;
        case "x":
          // Reject: send Escape keystroke if waiting with pending tool use
          if (selectedSession.status === "waiting" && selectedSession.pid && selectedSession.preview.hasPendingToolUse) {
            e.preventDefault();
            sendKeystroke(selectedSession.pid, "escape");
          }
          break;
        case "o":
          // Open session detail
          if (selectedSession) {
            e.preventDefault();
            window.location.href = `/session/${encodeURIComponent(selectedSession.id)}`;
          }
          break;
        case "p":
          // Open PR if exists
          if (selectedSession.prUrl) {
            e.preventDefault();
            fetch("/api/actions/open", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "open-url", url: selectedSession.prUrl }),
            }).catch(() => window.open(selectedSession.prUrl!, "_blank"));
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [orderedSessions, selectedSession, openAction, sendKeystroke]);

  return { selectedIndex, setSelectedIndex, selectedSession };
}
