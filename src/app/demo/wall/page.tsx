"use client";

// 데모 B: 전광판 — 상태색 타일 격자. 멀리서도 한눈에 읽히는 관제실 스타일.
import { useMemo, useState } from "react";
import { STATUS_META, relativeTime } from "@/lib/ui";
import { lastActionLine, needsAttention } from "@/lib/sessionView";
import { useSessions } from "@/lib/useSessions";
import { DemoNav } from "@/components/DemoNav";
import { StatusDot } from "@/components/StatusDot";
import { SessionDetail } from "@/components/SessionDetail";

// 상태별 타일 배경 틴트
const TINT: Record<string, string> = {
  working: "bg-emerald-50 border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/40",
  waiting: "bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/40",
  error: "bg-red-50 border-red-300 dark:bg-red-500/10 dark:border-red-500/40",
  idle: "bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-700",
  ended: "bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800",
};

export default function WallDemo() {
  const { sessions, home, now } = useSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tiles = useMemo(
    () => sessions.filter((s) => !(home && s.project_root === home)),
    [sessions, home],
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <DemoNav />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((s) => {
            const sm = STATUS_META[s.status];
            const attn = needsAttention(s);
            return (
              <button
                key={s.session_id}
                onClick={() => setSelectedId(s.session_id)}
                className={`flex min-h-32 flex-col rounded-lg border p-3.5 text-left transition hover:shadow-md ${TINT[s.status]}`}
              >
                <div className="flex items-center gap-2">
                  <StatusDot session={s} now={now} className="h-3 w-3" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-900 dark:text-white">
                    {s.alias || s.project_name}
                  </span>
                  {attn && <span className="shrink-0 text-sm">⏳</span>}
                </div>
                <p className="mt-2 line-clamp-3 flex-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {lastActionLine(s)}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sm.chip}`}>
                    {sm.label}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                    {relativeTime(s.last_event_at, now)}
                  </span>
                </div>
              </button>
            );
          })}
          {tiles.length === 0 && (
            <p className="col-span-full mt-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
              세션이 없어요.
            </p>
          )}
        </div>
      </div>
      {selectedId && <SessionDetail sessionId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
