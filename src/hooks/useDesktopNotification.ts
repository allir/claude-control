import { useCallback, useEffect, useRef } from "react";
import { ClaudeSession } from "@/lib/types";

function getStatusLabel(status: string): string {
  switch (status) {
    case "waiting": return "needs your attention";
    case "idle": return "finished working";
    case "finished": return "session ended";
    default: return status;
  }
}

function getRepoLabel(session: ClaudeSession): string {
  if (session.isWorktree && session.parentRepo) {
    return session.parentRepo.split("/").filter(Boolean).pop() || session.repoName || "Session";
  }
  return session.repoName || "Session";
}

function getBody(session: ClaudeSession): string {
  const parts: string[] = [];
  if (session.branch) parts.push(session.branch);
  if (session.taskSummary?.title) {
    parts.push(session.taskSummary.title);
  } else if (session.preview.lastAssistantText) {
    parts.push(session.preview.lastAssistantText.slice(0, 80));
  }
  return parts.join(" \u2022 ");
}

export function useDesktopNotification() {
  const permissionGranted = useRef(false);

  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        permissionGranted.current = true;
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          permissionGranted.current = p === "granted";
        });
      }
    }
  }, []);

  const notify = useCallback((session: ClaudeSession, newStatus: string) => {
    if (!permissionGranted.current) return;
    if (!("Notification" in window)) return;

    // Don't notify if the window is focused — user can already see the dashboard
    if (document.hasFocus()) return;

    const title = `${getRepoLabel(session)} ${getStatusLabel(newStatus)}`;
    const body = getBody(session);

    const notification = new Notification(title, {
      body: body || undefined,
      silent: true, // We handle our own sound
      icon: "/icon.png",
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    // Focus the window when clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, []);

  return notify;
}
