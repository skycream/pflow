"use client";

// 데모 C: 피드 — 모든 프로젝트의 최근 진행/보낸요청을 하나의 시간순 스트림으로.
import { useMemo, useState } from "react";
import type { SessionRow } from "@/lib/db";
import { relativeTime } from "@/lib/ui";
import { useSessions } from "@/lib/useSessions";
import { DemoNav } from "@/components/DemoNav";
import { StatusDot } from "@/components/StatusDot";
import { SessionDetail } from "@/components/SessionDetail";

type FeedItem = {
  key: string;
  ts: number;
  kind: "step" | "sent";
  session: SessionRow;
  request: string | null;
  text: string;
};

export default function FeedDemo() {
  const { sessions, home, now } = useSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const s of sessions) {
      if (home && s.project_root === home) continue;
      for (const st of s.recentSteps ?? [])
        items.push({
          key: `step-${st.id}`,
          ts: st.created_at,
          kind: "step",
          session: s,
          request: st.request,
          text: st.text,
        });
      for (const m of s.recentSent ?? [])
        items.push({
          key: `sent-${m.id}`,
          ts: m.created_at,
          kind: "sent",
          session: s,
          request: null,
          text: m.text,
        });
    }
    return items.sort((a, b) => b.ts - a.ts).slice(0, 60);
  }, [sessions, home]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <DemoNav />
        <div className="mt-5">
          {feed.length === 0 && (
            <p className="mt-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
              아직 활동이 없어요.
            </p>
          )}
          {feed.map((it) => (
            <button
              key={it.key}
              onClick={() => setSelectedId(it.session.session_id)}
              className="flex w-full items-start gap-3 border-b border-zinc-100 py-2.5 text-left hover:bg-zinc-100/60 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
            >
              <StatusDot session={it.session} now={now} className="mt-1.5 h-2 w-2" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {it.session.alias || it.session.project_name}
                  </span>
                  {it.kind === "sent" && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[11px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      📤 내가 보냄
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                    {relativeTime(it.ts, now)}
                  </span>
                </div>
                {it.request && (
                  <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                    요청 {it.request}
                  </p>
                )}
                <p className="text-sm text-zinc-800 dark:text-zinc-100">{it.text}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
      {selectedId && <SessionDetail sessionId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
