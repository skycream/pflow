"use client";

// 2-pane 관제판의 좌측 고정 목록 + 카테고리(드래그로 분류).
// 카테고리 안에서는 attentionRank 정렬 그대로 — 내 응답 필요한 게 위로.
import { useState } from "react";
import type { SessionRow } from "@/lib/db";
import type { Project } from "@/components/ProjectCard";
import { StatusDot } from "@/components/StatusDot";
// 정본은 sessionView.ts — 중복 정의하면 버그 수정이 한쪽만 반영되는 사고가 난다(실제 발생).
import { needsAttention, isDead, lastActionLine } from "@/lib/sessionView";

export type RailGroup = { id: string; name: string; projects: Project[] };

function RailRow({
  session,
  name,
  indent,
  selected,
  unread,
  now,
  onSelect,
  root,
}: {
  session: SessionRow;
  name: string;
  indent?: boolean;
  selected: boolean;
  unread?: boolean;
  now: number;
  onSelect: () => void;
  root: string;
}) {
  const dead = isDead(session);
  // 선택 분기(AskUserQuestion으로 A/B/C·1/2/3 물어봄) — 다른 대기(⏳)와 구분해 🔀로 강조
  const hasChoice = !dead && !!session.pending_question;
  const attn = !dead && !hasChoice && needsAttention(session);
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", root);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelect}
      className={`group/rail flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${indent ? "pl-5" : ""} ${
        dead
          ? "opacity-45 " + (selected ? "bg-zinc-200 dark:bg-zinc-700" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/70")
          : unread
            ? "flow-unread"
            : selected
              ? "bg-zinc-200 dark:bg-zinc-700"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
      }`}
    >
      {dead ? (
        <span className="shrink-0 text-xs">💀</span>
      ) : (
        <>
          {unread && (
            <span className="shrink-0 text-xs font-bold" style={{ color: "#65a30d" }}>
              ●
            </span>
          )}
          <StatusDot session={session} now={now} className="h-2 w-2" />
        </>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className={`font-medium ${dead ? "text-zinc-500 line-through dark:text-zinc-400" : "text-zinc-800 dark:text-zinc-100"}`}>
          {name}
        </span>
        <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          {dead ? "죽음 — 되살리기 가능" : lastActionLine(session)}
        </span>
      </span>
      {hasChoice && (
        <span className="shrink-0 text-sm" title="선택 분기 — 답을 골라주세요 (A/B/C·1/2/3)">
          🔀
        </span>
      )}
      {attn && <span className="shrink-0 text-xs text-amber-500">⏳</span>}
    </button>
  );
}

function ProjectRow({
  p,
  selectedId,
  onSelect,
  favorites,
  onToggleStar,
  now,
  onMove,
  isUnread,
}: {
  p: Project;
  selectedId: string | null;
  onSelect: (id: string) => void;
  favorites: string[];
  onToggleStar: (root: string) => void;
  now: number;
  onMove: (root: string, dir: -1 | 1) => void;
  isUnread?: (s: SessionRow) => boolean;
}) {
  const single = p.sessions.length === 1;
  const starred = favorites.includes(p.root);
  return (
    <div className="group/proj">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggleStar(p.root)}
          className={`shrink-0 cursor-pointer text-xs ${
            starred ? "text-amber-400" : "text-zinc-300 hover:text-amber-400 dark:text-zinc-600"
          }`}
          title="즐겨찾기"
        >
          {starred ? "★" : "☆"}
        </button>
        {single ? (
          <div className="min-w-0 flex-1">
            <RailRow
              session={p.sessions[0]}
              name={p.name}
              selected={selectedId === p.sessions[0].session_id}
              unread={isUnread?.(p.sessions[0])}
              now={now}
              root={p.root}
              onSelect={() => onSelect(p.sessions[0].session_id)}
            />
          </div>
        ) : (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", p.root);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="min-w-0 flex-1 cursor-grab truncate px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
          >
            {p.name} <span className="font-normal text-zinc-400 dark:text-zinc-500">{p.sessions.length}</span>
          </span>
        )}
        {/* 수동 순서 이동 ▲▼ (hover 시) */}
        <span className="flex shrink-0 items-center opacity-0 group-hover/proj:opacity-100">
          <button
            onClick={() => onMove(p.root, -1)}
            title="위로"
            className="px-0.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ▲
          </button>
          <button
            onClick={() => onMove(p.root, 1)}
            title="아래로"
            className="px-0.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ▼
          </button>
        </span>
      </div>
      {!single &&
        p.sessions.map((s) => (
          <RailRow
            key={s.session_id}
            session={s}
            name={s.session_alias || s.session_title || "세션"}
            indent
            selected={selectedId === s.session_id}
            unread={isUnread?.(s)}
            now={now}
            root={p.root}
            onSelect={() => onSelect(s.session_id)}
          />
        ))}
    </div>
  );
}

export function SessionRail({
  groups,
  selectedId,
  onSelect,
  favorites,
  onToggleStar,
  now,
  onAssign,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onMoveCategory,
  onMoveProject,
  isUnread,
}: {
  groups: RailGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  favorites: string[];
  onToggleStar: (root: string) => void;
  now: number;
  onAssign: (root: string, catId: string | null) => void;
  onAddCategory: () => void;
  onRenameCategory: (id: string) => void;
  onDeleteCategory: (id: string) => void;
  onMoveCategory: (id: string, dir: -1 | 1) => void;
  onMoveProject: (root: string, dir: -1 | 1) => void;
  isUnread?: (s: SessionRow) => boolean;
}) {
  const [dropCat, setDropCat] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isUncat = g.id === "__uncat__";
        const realCats = groups.filter((x) => x.id !== "__uncat__");
        const idx = realCats.findIndex((x) => x.id === g.id);
        return (
          <div
            key={g.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDropCat(g.id);
            }}
            onDragLeave={() => setDropCat((c) => (c === g.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setDropCat(null);
              const root = e.dataTransfer.getData("text/plain");
              if (root) onAssign(root, isUncat ? null : g.id);
            }}
            className={`rounded-md ${
              dropCat === g.id ? "bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-500/10" : ""
            }`}
          >
            {/* 카테고리 헤더 (미분류는 프로젝트가 있을 때만, 컨트롤 없음) */}
            {(!isUncat || g.projects.length > 0) && (
              <div className="group flex items-center gap-1 px-1 py-0.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {g.name} <span className="font-normal">{g.projects.length}</span>
                </span>
                {!isUncat && (
                  <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => onMoveCategory(g.id, -1)}
                      disabled={idx === 0}
                      className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                      title="위로"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => onMoveCategory(g.id, 1)}
                      disabled={idx === realCats.length - 1}
                      className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                      title="아래로"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => onRenameCategory(g.id)}
                      className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      title="이름 변경"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => onDeleteCategory(g.id)}
                      className="text-xs text-zinc-400 hover:text-red-500"
                      title="카테고리 삭제(프로젝트는 미분류로)"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
            )}
            {/* 빈 카테고리도 드롭 가능하게 최소 높이 */}
            {!isUncat && g.projects.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-zinc-300 dark:text-zinc-600">여기로 드래그</p>
            )}
            <div className="space-y-1.5">
              {g.projects.map((p) => (
                <ProjectRow
                  key={p.root}
                  p={p}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  favorites={favorites}
                  onToggleStar={onToggleStar}
                  now={now}
                  onMove={onMoveProject}
                  isUnread={isUnread}
                />
              ))}
            </div>
          </div>
        );
      })}
      <button
        onClick={onAddCategory}
        className="mt-1 w-full rounded border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:hover:text-zinc-300"
      >
        + 카테고리
      </button>
    </div>
  );
}
