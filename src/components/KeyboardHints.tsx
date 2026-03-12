"use client";

import { ClaudeSession } from "@/lib/types";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded bg-white/[0.06] border border-white/[0.10] text-[10px] font-semibold font-[family-name:var(--font-geist-mono)] text-zinc-400">
      {children}
    </kbd>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
      <Kbd>{keys}</Kbd>
      <span>{label}</span>
    </span>
  );
}

export function KeyboardHints({ selectedSession }: { selectedSession: ClaudeSession | null }) {
  const isWaiting = selectedSession?.status === "waiting" && selectedSession?.preview.hasPendingToolUse;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="max-w-7xl mx-auto px-6 pb-4">
        <div className="flex items-center justify-center gap-4 flex-wrap px-4 py-2 rounded-xl bg-[#0a0a0f]/90 backdrop-blur-md border border-white/[0.06] pointer-events-auto">
          <Hint keys="1-9" label="select" />
          {selectedSession ? (
            <>
              <span className="w-px h-3 bg-zinc-800" />
              <Hint keys="Enter" label="iTerm" />
              <Hint keys="E" label="editor" />
              <Hint keys="G" label="git" />
              <Hint keys="F" label="finder" />
              <Hint keys="O" label="open" />
              {selectedSession.prUrl && <Hint keys="P" label="PR" />}
              {isWaiting && (
                <>
                  <span className="w-px h-3 bg-zinc-800" />
                  <Hint keys="A" label="approve" />
                  <Hint keys="X" label="reject" />
                </>
              )}
              <span className="w-px h-3 bg-zinc-800" />
              <Hint keys="Esc" label="deselect" />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
