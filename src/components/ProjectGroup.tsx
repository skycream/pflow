"use client";

import type { SessionRow } from "@/lib/db";
import { STATUS_WEIGHT } from "@/lib/status";
import { STATUS_META } from "@/lib/ui";
import type { Project } from "./ProjectCard";
import { SessionAccordion } from "./SessionAccordion";

function lastAction(s: SessionRow): string {
  return s.just_did || s.last_activity || s.last_event || "—";
}

// 옵션 D + 접기: 접으면 각 세션 마지막 작업을 트리로, 펼치면 세션 아코디언.
export function ProjectGroup({
  project,
  now,
  onSessionClick,
  starred,
  onToggleStar,
  collapsed,
  onToggleCollapse,
}: {
  project: Project;
  now: number;
  onSessionClick: (id: string) => void;
  starred: boolean;
  onToggleStar: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  // 대표 상태 = 가장 활성(가중치 최소)인 세션
  const lead = project.sessions.reduce(
    (best, s) => (STATUS_WEIGHT[s.status] < STATUS_WEIGHT[best.status] ? s : best),
    project.sessions[0],
  );
  const m = STATUS_META[lead.status];

  return (
    <section className={collapsed ? "mb-1.5" : "mb-5"}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-1.5 dark:border-zinc-700">
        <button
          onClick={onToggleStar}
          title={starred ? "즐겨찾기 해제" : "상단 고정"}
          className={`shrink-0 text-base leading-none ${
            starred
              ? "text-amber-400"
              : "text-zinc-300 hover:text-amber-400 dark:text-zinc-600 dark:hover:text-amber-400"
          }`}
        >
          {starred ? "★" : "☆"}
        </button>

        <button
          onClick={onToggleCollapse}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="shrink-0 text-xs text-zinc-400">{collapsed ? "▸" : "▾"}</span>
          <h2 className="shrink-0 truncate text-sm font-bold text-zinc-900 dark:text-white">
            {project.name}
          </h2>
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${m.chip}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${m.dot} ${
                lead.status === "working" ? "flow-working" : ""
              }`}
            />
            {m.label}
          </span>
          {project.sessions.length > 1 && (
            <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
              {project.sessions.length}세션
            </span>
          )}
        </button>
      </div>

      {collapsed ? (
        /* 접힘: 각 세션의 마지막 작업을 └ 트리로 (완전히 안 숨김) */
        <div className="mt-1 space-y-0.5 pl-5">
          {project.sessions.map((s) => (
            <button
              key={s.session_id}
              onClick={() => onSessionClick(s.session_id)}
              className="flex w-full items-center gap-1.5 text-left text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span className="shrink-0 text-zinc-300 dark:text-zinc-600">└</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[s.status].dot}`} />
              <span className="min-w-0 truncate">{lastAction(s)}</span>
            </button>
          ))}
        </div>
      ) : (
        /* 펼침: 세션 아코디언 목록 */
        <div className="mt-2 space-y-1.5">
          {project.sessions.map((s) => (
            <SessionAccordion
              key={s.session_id}
              session={s}
              now={now}
              onOpenDetail={() => onSessionClick(s.session_id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
