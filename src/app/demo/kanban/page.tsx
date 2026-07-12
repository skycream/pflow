"use client";

// 데모 A: 칸반 — 상태별 컬럼으로 세션을 분류. triage(무엇이 내 손을 기다리나)에 강함.
import { useMemo, useState } from "react";
import type { SessionStatus } from "@/lib/status";
import { STATUS_META, relativeTime } from "@/lib/ui";
import { lastActionLine, needsAttention } from "@/lib/sessionView";
import { useSessions } from "@/lib/useSessions";
import { DemoNav } from "@/components/DemoNav";
import { SessionDetail } from "@/components/SessionDetail";

const COLUMNS: SessionStatus[] = ["working", "waiting", "error", "idle", "ended"];

export default function KanbanDemo() {
  const { sessions, home, now } = useSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byStatus = useMemo(() => {
    const m: Record<SessionStatus, typeof sessions> = {
      working: [],
      compacting: [],
      waiting: [],
      idle: [],
      error: [],
      ended: [],
    };
    for (const s of sessions) {
      if (home && s.project_root === home) continue;
      m[s.status].push(s);
    }
    return m;
  }, [sessions, home]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <DemoNav />
        <div className="mt-5 flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((st) => {
            const sm = STATUS_META[st];
            const items = byStatus[st];
            return (
              <div key={st} className="flex w-72 shrink-0 flex-col">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${sm.dot}`} />
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {sm.label}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-400">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.length === 0 && (
                    <p className="rounded-md border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-300 dark:border-zinc-800 dark:text-zinc-600">
                      없음
                    </p>
                  )}
                  {items.map((s) => {
                    const attn = needsAttention(s);
                    return (
                      <button
                        key={s.session_id}
                        onClick={() => setSelectedId(s.session_id)}
                        className={`rounded-md border border-l-4 border-zinc-200 ${sm.bar} bg-white p-3 text-left hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${
                          s.status === "working" ? "flow-working" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-white">
                            {s.alias || s.project_name}
                          </span>
                          {attn && <span className="shrink-0 text-xs text-amber-500">⏳</span>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {lastActionLine(s)}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                          {relativeTime(s.last_event_at, now)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedId && <SessionDetail sessionId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
