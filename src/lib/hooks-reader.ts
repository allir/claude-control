import { homedir } from "os";
import { join } from "path";
import { readdir, stat, open, unlink } from "fs/promises";
import { SessionStatus } from "./types";

const EVENTS_DIR = join(homedir(), ".claude-control", "events");
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface HookStatus {
  status: SessionStatus;
  event: string;
  ts: number;
  cwd: string | null;
}

const EVENT_TO_STATUS: Record<string, SessionStatus> = {
  UserPromptSubmit: "working",
  SubagentStart: "working",
  PostToolUseFailure: "working",
  Stop: "idle",
  SessionStart: "idle",
  PermissionRequest: "waiting",
  SessionEnd: "finished",
};

export function classifyStatusFromHook(eventName: string): SessionStatus | null {
  return EVENT_TO_STATUS[eventName] ?? null;
}

async function readLastLine(filePath: string): Promise<string | null> {
  let fh;
  try {
    fh = await open(filePath, "r");
    const fileStat = await fh.stat();
    if (fileStat.size === 0) return null;

    const readSize = Math.min(512, fileStat.size);
    const buffer = Buffer.alloc(readSize);
    await fh.read(buffer, 0, readSize, fileStat.size - readSize);

    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    return lines.length > 0 ? lines[lines.length - 1] : null;
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

export async function readAllHookStatuses(): Promise<Map<string, HookStatus>> {
  const result = new Map<string, HookStatus>();

  let entries: string[];
  try {
    entries = await readdir(EVENTS_DIR);
  } catch {
    return result;
  }

  const now = Date.now();

  await Promise.all(
    entries
      .filter((e) => e.endsWith(".jsonl"))
      .map(async (filename) => {
        const filePath = join(EVENTS_DIR, filename);
        const sessionId = filename.replace(/\.jsonl$/, "");

        // Clean up stale files
        try {
          const s = await stat(filePath);
          if (now - s.mtimeMs > STALE_THRESHOLD_MS) {
            await unlink(filePath).catch(() => {});
            return;
          }
        } catch {
          return;
        }

        const lastLine = await readLastLine(filePath);
        if (!lastLine) return;

        try {
          const data = JSON.parse(lastLine) as {
            event?: string;
            session_id?: string;
            cwd?: string;
            ts?: number;
          };

          if (!data.event) return;

          const status = classifyStatusFromHook(data.event);
          if (!status) return;

          result.set(sessionId, {
            status,
            event: data.event,
            ts: data.ts ?? 0,
            cwd: data.cwd ?? null,
          });
        } catch {
          // Invalid JSON line — skip
        }
      })
  );

  return result;
}
