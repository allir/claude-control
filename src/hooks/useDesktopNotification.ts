import { useCallback, useEffect, useRef } from "react";
import { ClaudeSession } from "@/lib/types";

const STATUS_ACTION: Record<string, string> = {
  waiting: "Waiting for input",
  idle: "Done",
  finished: "Session ended",
};

function getTitle(session: ClaudeSession, newStatus: string): string {
  const action = STATUS_ACTION[newStatus] ?? newStatus;
  const repo = getRepoLabel(session);
  return `${action} — ${repo}`;
}

function getRepoLabel(session: ClaudeSession): string {
  if (session.isWorktree && session.parentRepo) {
    return session.parentRepo.split("/").filter(Boolean).pop() || session.repoName || "Session";
  }
  return session.repoName || "Session";
}

function getBody(session: ClaudeSession, newStatus: string): string {
  const lines: string[] = [];

  if (session.branch) {
    lines.push(session.branch);
  }

  if (session.taskSummary?.title) {
    lines.push(session.taskSummary.title);
  } else if (session.preview.lastAssistantText) {
    lines.push(session.preview.lastAssistantText.slice(0, 100));
  }

  if (newStatus === "waiting" && session.preview.lastTools.length > 0) {
    const tool = session.preview.lastTools[session.preview.lastTools.length - 1];
    lines.push(tool.description || tool.name);
  }

  return lines.join("\n");
}

export function useDesktopNotification(alwaysNotify: boolean = false) {
  const permissionGranted = useRef(false);
  const alwaysNotifyRef = useRef(alwaysNotify);
  alwaysNotifyRef.current = alwaysNotify;

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

    // Don't notify if the window is focused — unless alwaysNotify is on
    if (document.hasFocus() && !alwaysNotifyRef.current) return;

    const title = getTitle(session, newStatus);
    const body = getBody(session, newStatus);

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
