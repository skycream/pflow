"use client";

import { useState } from "react";
import type { SessionRow } from "@/lib/db";
import type { SessionStatus } from "@/lib/status";
import { STATUS_META } from "@/lib/ui";
import { ProjectCard, type Project } from "@/components/ProjectCard";

// ── 샘플 데이터 (recap 요약 스타일) ─────────────────────────
const T = 1_700_000_000_000; // 고정 기준시각 (상대시간 표시는 미리보기라 단순화)
function s(
  id: string,
  status: SessionStatus,
  summary: string,
  agoMin: number,
): SessionRow {
  // SessionRow의 모든 필드를 갖춘 목데이터 (누락 필드는 null/기본값)
  return {
    session_id: id,
    cwd: "",
    project_root: "",
    project_name: "",
    alias: null,
    session_title: null,
    source: "claude",
    status,
    stage: null,
    just_did: summary,
    next_action: null,
    blocker: null,
    last_tool: null,
    last_event: null,
    last_activity: null,
    last_event_at: T - agoMin * 60_000,
    created_at: T,
    session_alias: null,
    tmux_pane: null,
    tty: null,
    iterm_id: null,
    transcript_path: null,
    next_options: null,
    pending_question: null,
    recap: null,
    last_stop_at: null,
    last_prompt_at: null,
    stuck: null,
    dead: null,
    error_reason: null,
  } as SessionRow;
}

const PROJECTS: Project[] = [
  {
    root: "/a/gongsilnet",
    name: "gongsilnet",
    folder: "gongsilnet",
    alias: null,
    sessions: [
      s("1", "working", "SEO 메타태그 SSR 적용 완료, 다음은 블로그 매거진 디자인 컴포넌트 이식", 2),
      s("2", "waiting", "로그인 폼 검증 로직 추가 중 — 권한 승인 대기", 10),
    ],
  },
  {
    root: "/a/pills",
    name: "약통 알림",
    folder: "pills",
    alias: "약통 알림",
    sessions: [s("3", "idle", "결제 모듈 PortOne 연동 1차 완료, 테스트 남음", 64)],
  },
  {
    root: "/a/blog",
    name: "blog",
    folder: "blog",
    alias: null,
    sessions: [s("4", "error", "프로덕션 빌드 실패 — 타입 에러 3건 수정 필요", 5)],
  },
];

const now = T; // 미리보기용 고정
function ago(at: number) {
  const m = Math.round((now - at) / 60_000);
  return m < 60 ? `${m}분 전` : `${Math.round(m / 60)}시간 전`;
}
function lead(p: Project) {
  return STATUS_META[p.sessions[0].status];
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h2>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{desc}</p>
      {children}
    </section>
  );
}

export default function Preview() {
  const [open, setOpen] = useState<Record<string, boolean>>({ "/a/gongsilnet": true });
  const noop = () => {};

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-xl font-bold">대시보드 레이아웃 미리보기</h1>

        {/* A: 중첩 카드 */}
        <Section title="A. 중첩 카드" desc="프로젝트 카드 안에 세션을 한 줄씩. 전광판처럼 한눈에.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROJECTS.map((p) => (
              <ProjectCard key={p.root} project={p} now={now} onSessionClick={noop} />
            ))}
          </div>
        </Section>

        {/* B: 아코디언 */}
        <Section title="B. 아코디언" desc="접힌 프로젝트 줄, 클릭하면 세션 펼침. 폴더 많아도 깔끔.">
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            {PROJECTS.map((p) => {
              const m = lead(p);
              const isOpen = open[p.root];
              return (
                <div key={p.root} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [p.root]: !o[p.root] }))}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span className="text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                    <span className="w-28 shrink-0 truncate text-sm font-medium">{p.name}</span>
                    <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs ${m.chip}`}>
                      <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                      {m.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-300">
                      {p.sessions[0].just_did}
                    </span>
                    {p.sessions.length > 1 && (
                      <span className="shrink-0 text-xs text-zinc-400">{p.sessions.length}</span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="space-y-0.5 px-3 pb-2 pl-9">
                      {p.sessions.map((ss) => (
                        <div key={ss.session_id} className="flex items-center gap-2 text-sm">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[ss.status].dot}`} />
                          <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
                            {ss.just_did}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-400">{ago(ss.last_event_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* D: 그룹 헤더 + 세션 카드 */}
        <Section title="D. 그룹 헤더 + 세션 카드" desc="프로젝트 구분선 아래 세션 카드들. 세션별 정보 풍부.">
          {PROJECTS.map((p) => {
            const m = lead(p);
            return (
              <div key={p.root} className="mb-3">
                <div className="mb-1.5 flex items-center gap-2 border-b border-zinc-200 pb-1 dark:border-zinc-700">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className={`flex items-center gap-1 text-xs ${m.chip} rounded-full px-1.5 py-0.5`}>
                    <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                    {m.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {p.sessions.map((ss) => (
                    <div
                      key={ss.session_id}
                      className={`rounded-md border border-l-4 border-zinc-200 ${STATUS_META[ss.status].bar} bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900`}
                    >
                      <p className="line-clamp-2 text-xs text-zinc-700 dark:text-zinc-200">{ss.just_did}</p>
                      <p className="mt-1 text-[11px] text-zinc-400">{ago(ss.last_event_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Section>

        {/* E: 대표 세션 타일 + 나머지 배지 */}
        <Section title="E. 대표 타일 + 배지" desc="폴더당 가장 중요한 세션만 크게, 나머지는 배지. 가장 깔끔.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROJECTS.map((p) => {
              const m = lead(p);
              const rest = p.sessions.slice(1);
              return (
                <div
                  key={p.root}
                  className={`rounded-lg border border-l-4 border-zinc-200 ${m.bar} bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.name}</span>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${m.chip}`}>
                      <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                      {m.label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-100">{p.sessions[0].just_did}</p>
                  {rest.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
                      <span>⋯ +{rest.length} 세션</span>
                      {rest.map((ss) => (
                        <span key={ss.session_id} className={`h-2 w-2 rounded-full ${STATUS_META[ss.status].dot}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <p className="text-xs text-zinc-400">
          C(사이드바)는 전체 레이아웃이라 여기선 생략 — 원하면 따로 띄울게.
        </p>
      </div>
    </div>
  );
}
