// 세션 상태 모델 및 hook 이벤트 → 상태 파생 로직 (자동층)

// 전광판에 표시되는 세션의 현재 상태
export type SessionStatus =
  | "working" // 작업 중 (프롬프트 처리/도구 실행)
  | "compacting" // 컨텍스트 압축 중 (/compact·자동) — 자동 진행, 내 개입 불필요
  | "waiting" // 입력·권한 대기 (사람의 응답 필요)
  | "idle" // 턴 종료, 유휴
  | "error" // 턴 실패
  | "ended"; // 세션 종료

// 정렬 가중치: 낮을수록 위로. "나를 기다리는 세션(대기/에러)"을 맨 앞에.
export const STATUS_WEIGHT: Record<SessionStatus, number> = {
  waiting: 0,
  error: 1,
  working: 2,
  compacting: 3, // working 다음 (내가 할 일 없음)
  idle: 4,
  ended: 5,
};

// PM 단계 (의미층 update_status가 채움). 자동층은 건드리지 않는다.
export const STAGES = [
  "발견",
  "기획",
  "디자인",
  "개발",
  "테스트",
  "배포",
] as const;
export type Stage = (typeof STAGES)[number];

// hook 이벤트 이름 + payload로 다음 상태를 결정한다.
// null을 반환하면 "이전 상태 유지"를 의미한다.
export function deriveStatus(
  eventName: string,
  payload: Record<string, unknown>,
): SessionStatus | null {
  switch (eventName) {
    case "SessionStart":
      return "idle"; // 시작/재개 직후, 첫 프롬프트 대기
    case "PreToolUse":
      // AskUserQuestion은 사람의 답을 기다리며 블록됨 → waiting (상태점이 '작업중'으로 오인 안 되게)
      if (String(payload.tool_name ?? "") === "AskUserQuestion") return "waiting";
      return "working";
    case "UserPromptSubmit":
    case "PostToolUse":
    case "PostToolUseFailure":
    case "PostToolBatch":
      return "working";
    case "Stop":
      return "idle"; // 턴 종료 → 유휴
    case "PreCompact":
      return "compacting"; // 컨텍스트 압축 시작 — 에러 아님
    case "StopFailure":
      return "error";
    case "Notification": {
      // permission_prompt / idle 등 사람의 개입이 필요한 알림 → 대기
      const type = String(payload.type ?? "");
      if (type.includes("permission") || type.includes("idle")) return "waiting";
      return null;
    }
    case "SessionEnd":
      return "ended";
    default:
      return null; // 그 외 이벤트는 상태를 바꾸지 않음 (활동 신호로만 기록)
  }
}
