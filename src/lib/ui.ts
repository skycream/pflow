// 클라이언트 전용 표시 유틸 (node 의존성 없음).
import type { SessionStatus } from "./status";

// 상태 → 신호등. 대비 강하게: 밝은 점 + 또렷한 상태 칩 + 카드 좌측 색 바.
export const STATUS_META: Record<
  SessionStatus,
  { label: string; dot: string; chip: string; bar: string }
> = {
  working: {
    label: "작업중",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    chip: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/40",
    bar: "border-l-emerald-500 dark:border-l-emerald-400",
  },
  compacting: {
    label: "압축중",
    dot: "bg-violet-500 dark:bg-violet-400",
    chip: "bg-violet-100 text-violet-800 ring-1 ring-violet-300 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-400/40",
    bar: "border-l-violet-500 dark:border-l-violet-400",
  },
  waiting: {
    label: "대기",
    dot: "bg-amber-500 dark:bg-amber-400",
    chip: "bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/25 dark:text-amber-100 dark:ring-amber-400/50",
    bar: "border-l-amber-500 dark:border-l-amber-400",
  },
  idle: {
    label: "유휴",
    dot: "bg-zinc-400 dark:bg-zinc-400",
    chip: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-300 dark:bg-zinc-700/50 dark:text-zinc-200 dark:ring-zinc-500/40",
    bar: "border-l-zinc-400 dark:border-l-zinc-500",
  },
  error: {
    label: "에러",
    dot: "bg-red-500 dark:bg-red-500",
    chip: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-500/25 dark:text-red-100 dark:ring-red-400/50",
    bar: "border-l-red-500 dark:border-l-red-500",
  },
  ended: {
    label: "종료",
    dot: "bg-zinc-400 dark:bg-zinc-600",
    chip: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
    bar: "border-l-zinc-300 dark:border-l-zinc-700",
  },
};

// stale 임계값 (ms). 마지막 활동이 이보다 오래되면 흐리게.
export const STALE_MS = 3 * 60 * 1000;

// 주기작업 신호등: 마지막 실행으로부터 경과 시간 기준.
export type Freshness = "live" | "ok" | "stale";
export function freshness(lastAt: number, now: number): Freshness {
  const ms = now - lastAt;
  if (ms < 60 * 1000) return "live"; // 1분 내 = 실행 중/방금
  if (ms < 60 * 60 * 1000) return "ok"; // 1시간 내 = 정상
  return "stale"; // 1시간 이상 = 지연(주황)
}
export const FRESH_META: Record<
  Freshness,
  { dot: string; label: string; blink: boolean }
> = {
  live: { dot: "bg-emerald-500", label: "실행 중", blink: true },
  ok: { dot: "bg-emerald-500", label: "정상", blink: false },
  stale: { dot: "bg-amber-500", label: "지연", blink: false },
};

// 절대 타임스탬프(ms) → "방금 / N초 전 / N분 전 …"
export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return "방금";
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
