"use client";

import type { SessionRow } from "@/lib/db";
import { STATUS_WEIGHT } from "@/lib/status";
import { STATUS_META, STALE_MS, relativeTime } from "@/lib/ui";

// 세션 한 줄 요약: recap/flow 요약 우선, 없으면 활동/이벤트
function summaryLine(s: SessionRow): string {
  if (s.just_did) return s.just_did;
  if (s.last_activity) return s.last_activity;
  return s.last_event ?? "—";
}

export interface Project {
  root: string;
  name: string; // 별명 || 폴더명
  folder: string; // 폴더명
  alias: string | null;
  sessions: SessionRow[];
}

export function ProjectCard({
  project,
  now,
  onSessionClick,
}: {
  project: Project;
  now: number;
  onSessionClick: (id: string) => void;
}) {
  // 대표 상태 = 가장 활성(가중치 최소)인 세션
  const lead = project.sessions.reduce(
    (best, s) => (STATUS_WEIGHT[s.status] < STATUS_WEIGHT[best.status] ? s : best),
    project.sessions[0],
  );
  const meta = STATUS_META[lead.status];

  return (
    <div
      className={`rounded-lg border border-l-4 border-zinc-200 ${meta.bar} bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900`}
    >
      {/* 프로젝트 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
          {project.name}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {project.sessions.length > 1 && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {project.sessions.length}세션
            </span>
          )}
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.chip}`}
          >
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
      </div>

      {/* 별명이 있으면 폴더 표기 */}
      {project.alias && (
        <p className="mt-0.5 truncate font-mono text-xs text-zinc-400 dark:text-zinc-500">
          {project.folder}/
        </p>
      )}

      {/* 세션 목록 (한 줄씩) */}
      <div className="mt-3 space-y-0.5">
        {project.sessions.map((s) => {
          const sm = STATUS_META[s.status];
          const stale = now - s.last_event_at > STALE_MS;
          return (
            <button
              key={s.session_id}
              onClick={() => onSessionClick(s.session_id)}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                stale ? "opacity-60" : ""
              }`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sm.dot}`} />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">
                {summaryLine(s)}
              </span>
              <span className="shrink-0 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                {relativeTime(s.last_event_at, now)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
