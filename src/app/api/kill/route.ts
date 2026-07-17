// 세션 죽이기: iTerm 탭(세션)을 닫아 claude + 자식 MCP 프로세스를 종료해 메모리를 회수한다.
// DB 레코드는 지우지 않고 dead=1(💀)로 표시 — 목록에 남겨두고 나중에 되살리거나 삭제.
import { runCmd } from "@/lib/osaEnv";
import { getSession, markDead } from "@/lib/db";

export const runtime = "nodejs";


function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(req: Request) {
  let body: { session_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const ids = Array.isArray(body.session_ids) ? body.session_ids : [];
  if (ids.length === 0) return Response.json({ ok: false, error: "session_ids 필요" }, { status: 400 });

  // 대상 세션들의 iTerm GUID 수집
  const guids: string[] = [];
  for (const id of ids) {
    const s = getSession(id);
    const g = (s?.iterm_id || "").split(":").pop() || "";
    if (g) guids.push(g);
  }

  // iTerm 탭(세션) 닫기 — 매칭 세션을 먼저 모은 뒤 닫는다(순회 중 변경 방지)
  if (guids.length > 0) {
    const list = guids.map((g) => `"${esc(g)}"`).join(", ");
    const script = `tell application "iTerm2"
  set theGuids to {${list}}
  set toClose to {}
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if (id of s) is in theGuids then set end of toClose to s
      end repeat
    end repeat
  end repeat
  repeat with s in toClose
    try
      close s
    end try
  end repeat
end tell
return "ok"`;
    runCmd("osascript", ["-e", script]);
  }

  // 프로세스 종료 성공 여부와 무관하게 죽음(💀) 표시 — 사용자가 죽이기로 결정한 것
  for (const id of ids) markDead(id);

  return Response.json({ ok: true, count: ids.length });
}
