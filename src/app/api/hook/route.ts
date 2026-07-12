// Claude Code Hooks 수집 엔드포인트 (자동층).
// 각 프로젝트의 .claude/settings.json에서 http hook으로 이 URL에 이벤트 JSON을 POST한다.

import { recordEvent } from "@/lib/db";
import { revivePending } from "@/lib/revivePending";

export const runtime = "nodejs"; // better-sqlite3는 Node 런타임 필요

export async function POST(req: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // http hook은 {event, timestamp, data:{...}} 형태로 감쌀 수 있고,
  // command+curl은 hook payload를 그대로 보낸다. 둘 다 수용한다.
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  const row = recordEvent(data);

  // 되살린 세션이 기동(SessionStart)하면, 대기시켜둔 메시지를 자동 주입한다.
  // claude --resume이 대화를 로드하고 프롬프트를 받을 준비가 될 시간을 두고 전송.
  if (data.hook_event_name === "SessionStart") {
    const sid = String(data.session_id ?? "");
    const pending = sid ? revivePending.get(sid) : undefined;
    if (pending) {
      revivePending.delete(sid);
      setTimeout(() => {
        fetch("http://localhost:3000/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sid,
            text: pending,
            enter: true,
            display: `↻ 되살려 전송: ${pending.slice(0, 30)}`,
          }),
        }).catch(() => {});
      }, 6000);
    }
  }

  // UserPromptSubmit 응답으로 "맨 끝 줄에 [flow] 요약을 남겨라"는 지시를 주입한다.
  // (http hook 응답의 additionalContext가 그 턴의 Claude 컨텍스트에 추가됨)
  if (data.hook_event_name === "UserPromptSubmit") {
    return Response.json({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "[관제] 응답의 마지막 두 줄에 반드시 다음을 남겨라.\n" +
          "1) 요약: `[flow] <내가 요청한 것 한줄> → <한 일/결과 한줄>` (각 25자 이내, 핵심 명사, 화살표 구분).\n" +
          "2) 다음 옵션: `[flow-next] 옵션1 | 옵션2 | 옵션3 | 옵션4 | 옵션5`. **항상 정확히 5개**를 `|`로 구분해 제시하라. " +
          "네가 응답 본문에서 사용자에게 선택지(A/B/C, 1·2·3, '다른 선택지' 등)를 제시했다면 **그 선택지 문구를 재서술·요약하지 말고 본문에 쓴 그대로**(추천/등급 표시 포함) 먼저 옮기고, " +
          "5개에 못 미치면 다음에 할 수 있는 합리적인 작업으로 채워 5개를 맞춰라. 길어도 자르지 말고 본문 문구를 유지하라. 사용자가 골라(여러 개 가능) 그대로 너에게 전달된다.\n" +
          "이 두 줄은 관제 대시보드가 읽는다.",
      },
    });
  }

  return Response.json({ ok: true, session: row?.session_id ?? null });
}
