// 데모 레이아웃들이 공유하는 순수 표시 헬퍼 (JSX 없음).
import type { SessionRow } from "@/lib/db";

// 죽은 세션인지 — 내가 kill(dead=1)했거나, SessionEnd로 종료(ended)된 것. 둘 다 💀로 표시.
export function isDead(s: SessionRow): boolean {
  return !!s.dead || s.status === "ended";
}

// 일시적(재시도하면 풀리는) 에러인지 — rate limit / 과부하 / 일시 제한
export function isTransientError(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return /rate limit|temporarily|overloaded|limiting requests|529|503|too many requests/i.test(reason);
}

// 세션 한 줄 요약(마지막 작업)
export function lastActionLine(s: SessionRow): string {
  return s.just_did || s.last_activity || s.session_title || s.last_event || "—";
}

// 보낸 요청 중 아직 응답 안 온 것.
// "응답 왔다"는 내 메시지가 실제로 접수된 뒤 처리됐는지로 판정한다:
//  (a) 보낸 뒤 새 진행단계([flow])가 생겼거나,
//  (b) 내 메시지가 프롬프트로 접수(UserPromptSubmit)된 뒤 턴이 종료(Stop)됐거나,
//  (c) 접수 뒤 idle로 멈췄는지.
// 핵심: 작업중(working)일 때 보낸 메시지는, 진행 중이던 "이전 턴"의 Stop을
//       내 응답으로 오인하면 안 된다 → Stop이 내 메시지 접수(prompt) 이후여야 한다.
export function pendingSentMessages(s: SessionRow) {
  const steps = s.recentSteps ?? [];
  const prompt = s.last_prompt_at;
  const answered = (m: { created_at: number; answered_at: number | null }) => {
    if (m.answered_at != null) return true; // 서버에서 응답 완료로 래칭됨 (부활 안 함)
    if (steps.some((st) => st.created_at > m.created_at)) return true; // 새 진행단계 = 확실히 응답
    // 아직 래칭 전이지만 접수(prompt) 후 idle이면 응답 완료로 간주 (래칭은 다음 Stop 이벤트에)
    const accepted = prompt != null && prompt >= m.created_at;
    return accepted && s.status === "idle";
  };
  return (s.recentSent ?? []).filter((m) => !answered(m));
}

// 내 주의가 필요한 세션인지 (질문 대기 / 응답 안 준 보낸요청 / waiting)
export function needsAttention(s: SessionRow): boolean {
  if (s.dead) return false; // 죽은(💀) 세션은 주의 대상 아님
  if (s.pending_question) return true;
  if (s.status === "waiting") return true;
  return pendingSentMessages(s).length > 0;
}

// 정렬 우선순위(작을수록 위). 내 응답이 필요한 게 최상단, LLM 작업중은 최하단.
export function attentionRank(s: SessionRow): number {
  if (s.status === "working" || s.status === "compacting") return 5; // 작업/압축 중 → 최하단 (내가 할 게 없음)
  if (s.status === "ended") return 4; // 종료
  if (needsAttention(s)) return 0; // 명시적으로 내 답이 필요 (질문/대기/미응답 보낸요청)
  if (s.status === "error") return 1; // 에러 → 내가 봐야 함
  if (s.status === "idle") return 2; // LLM이 응답 끝냄 = 내 차례
  return 3;
}

// 프로젝트(루트) 단위로 묶기. 홈 루트(주기작업)는 제외.
export function groupByProject(
  sessions: SessionRow[],
  home: string,
): { root: string; name: string; folder: string; sessions: SessionRow[] }[] {
  const map = new Map<string, { root: string; name: string; folder: string; sessions: SessionRow[] }>();
  for (const s of sessions) {
    if (home && s.project_root === home) continue;
    let p = map.get(s.project_root);
    if (!p) {
      p = { root: s.project_root, name: s.alias || s.project_name, folder: s.project_name, sessions: [] };
      map.set(s.project_root, p);
    }
    p.sessions.push(s);
  }
  return [...map.values()];
}
