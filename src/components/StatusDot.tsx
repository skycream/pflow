"use client";

// 상태 신호등 점.
// - idle(=LLM이 응답을 끝냄 → 내 차례): 경과 시간을 3단계로 구분.
//   · 0~1시간: 파란색(최근일수록 진함 → 1시간에 걸쳐 연해짐) + ping
//   · 1시간~1일: 노란색 + 약한 ping (좀 지났으니 주의)
//   · 1일 이상: 회색 + ping 없음 (오래돼서 조용히)
// - waiting(질문 대기): 노란색 + ping (가장 긴급, 명시적 답 필요).
// - working(LLM 작업 중): 초록 + flow-working 링(은은하게, 내가 할 일은 없음).
import type { SessionRow } from "@/lib/db";
import { STATUS_META } from "@/lib/ui";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BLUE = [59, 130, 246]; // blue-500 (막 끝남, 내 차례)
const BLUE_LIGHT = [147, 197, 253]; // blue-300 (1시간 가까이 — 연한 파랑)
const AMBER = [251, 191, 36]; // amber-400 (1시간~1일)
const GRAY = [161, 161, 170]; // zinc-400 (1일 이상, 식음)

export function StatusDot({
  session,
  now,
  className = "h-2 w-2",
}: {
  session: Pick<SessionRow, "status" | "last_event_at">;
  now: number;
  className?: string;
}) {
  const st = session.status;
  let color: string | null = null; // idle 페이드(인라인 rgb)
  let bgClass = ""; // 그 외 상태 색(Tailwind)
  let ping = false; // 주의 펄스(헤일로)
  let pingOpacity = 0.55;
  let workingRing = false;

  if (st === "idle") {
    const age = Math.max(0, now - session.last_event_at);
    if (age < HOUR_MS) {
      // 0~1시간: 파랑 → 연한 파랑 (최근일수록 진함), 강한 펄스
      const t = age / HOUR_MS;
      const c = BLUE.map((b, i) => Math.round(b + (BLUE_LIGHT[i] - b) * t));
      color = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      ping = true;
      pingOpacity = 0.25 + 0.4 * (1 - t);
    } else if (age < DAY_MS) {
      // 1시간~1일: 노란색 + 약한 펄스
      color = `rgb(${AMBER[0]}, ${AMBER[1]}, ${AMBER[2]})`;
      ping = true;
      pingOpacity = 0.35;
    } else {
      // 1일 이상: 회색, 펄스 없음 (오래돼서 조용히)
      color = `rgb(${GRAY[0]}, ${GRAY[1]}, ${GRAY[2]})`;
      ping = false;
    }
  } else if (st === "waiting") {
    bgClass = "bg-amber-500 dark:bg-amber-400";
    ping = true;
    pingOpacity = 0.6;
  } else if (st === "working" || st === "compacting") {
    // 압축 중도 자동 진행이라 working처럼 은은한 링(색은 상태별)
    bgClass = STATUS_META[st].dot;
    workingRing = true;
  } else {
    bgClass = STATUS_META[st].dot;
  }

  const dotStyle = color ? { backgroundColor: color } : undefined;
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {ping && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${bgClass}`}
          style={{ ...dotStyle, opacity: pingOpacity }}
        />
      )}
      <span
        className={`relative inline-flex h-full w-full rounded-full ${bgClass} ${
          workingRing ? "flow-working" : ""
        }`}
        style={dotStyle}
      />
    </span>
  );
}
