"use client";

import type { SessionRow } from "@/lib/db";
import { STATUS_META, STALE_MS, relativeTime } from "@/lib/ui";

// 자동층 fallback: 의미층(방금 한 일)이 비어있으면 이벤트·도구로 대체 표시
function activityLine(s: SessionRow): string {
  if (s.just_did) return s.just_did; // Tier2: MCP/LLM 요약
  if (s.last_activity) return s.last_activity; // Tier1: tool_input 기반 활동
  if (s.last_tool && s.last_event) return `${s.last_event} · ${s.last_tool}`;
  return s.last_event ?? "—";
}

export function SessionCard({
  session,
  now,
  onClick,
}: {
  session: SessionRow;
  now: number;
  onClick?: () => void;
}) {
  const meta = STATUS_META[session.status];
  const stale = now - session.last_event_at > STALE_MS;

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg border border-l-4 border-zinc-200 ${meta.bar} bg-white p-4 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/80 ${
        stale ? "opacity-60" : ""
      }`}
    >
      {/* 헤더: 이름 + 폴더 + 상태 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          {/* 이름 (별명 우선, 없으면 폴더명) */}
          <h2
            className="truncate text-base font-semibold text-zinc-900 dark:text-white"
            title={session.cwd}
          >
            {session.alias || session.project_name}
          </h2>
          {/* 폴더 — 별명이 있을 때만 (슬래시 표기) */}
          {session.alias && (
            <span
              className="truncate font-mono text-xs text-zinc-400 dark:text-zinc-500"
              title={session.cwd}
            >
              {session.project_name}/
            </span>
          )}
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.chip}`}
        >
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      {/* 단계 */}
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">단계</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
          {session.stage ?? "–"}
        </span>
      </div>

      {/* 작업 주제 (Claude가 붙인 세션 제목) */}
      {session.session_title && (
        <div
          className="mt-2 truncate text-sm text-zinc-700 dark:text-zinc-200"
          title={session.session_title}
        >
          <span className="text-zinc-500 dark:text-zinc-400">작업 </span>
          {session.session_title}
        </div>
      )}

      {/* 방금 한 일 */}
      <div
        className="mt-2 truncate text-sm text-zinc-800 dark:text-zinc-100"
        title={activityLine(session)}
      >
        <span className="text-zinc-500 dark:text-zinc-400">방금 </span>
        {activityLine(session)}
      </div>

      {/* 다음 할 일 */}
      {session.next_action && (
        <div
          className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-200"
          title={session.next_action}
        >
          <span className="text-zinc-500 dark:text-zinc-400">다음 </span>
          {session.next_action}
        </div>
      )}

      {/* 막힌 점 */}
      {session.blocker && (
        <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-200">
          ⚠ {session.blocker}
        </div>
      )}

      {/* 마지막 활동 시각 */}
      <div className="mt-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {relativeTime(session.last_event_at, now)}
      </div>
    </div>
  );
}
