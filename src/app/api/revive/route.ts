// 죽은(💀) 세션 하나를 되살린다: 새 iTerm 탭에서 해당 폴더로 이동해 claude --resume 실행.
// dead=0으로 되돌리고, 세션이 다시 이벤트를 보내면 상태도 자동 정상화된다.
import { runCmd } from "@/lib/osaEnv";
import { getSession, reviveSession } from "@/lib/db";
import { revivePending } from "@/lib/revivePending";

export const runtime = "nodejs";


function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(req: Request) {
  let body: { session_id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const id = String(body.session_id ?? "").trim();
  if (!id) return Response.json({ ok: false, error: "session_id 필요" }, { status: 400 });

  const s = getSession(id);
  if (!s) return Response.json({ ok: false, error: "세션 없음" }, { status: 404 });
  if (!s.cwd) return Response.json({ ok: false, error: "cwd 없음 — 되살릴 수 없음" }, { status: 409 });

  const text = typeof body.text === "string" ? body.text.trim() : "";

  // 방어: DB엔 죽음/종료로 있어도 실제 탭이 살아있으면(SessionEnd 오발동·상태 꼬임) 새 탭을
  // 열지 말고 그 탭으로 바로 보낸다. "엉뚱한 새 탭에 명령이 가는" 사고를 막는 핵심.
  const guid = esc((s.iterm_id || "").split(":").pop() || "");
  if (guid) {
    const submit = text
      ? `\n          tell se to write text "${esc(text)}" newline no\n          delay 0.4\n          tell se to write text "" newline yes`
      : "";
    const liveScript = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with se in sessions of t
        if id of se is "${guid}" then
          select w
          tell t to select
          activate${submit}
          return "live"
        end if
      end repeat
    end repeat
  end repeat
  return "dead"
end tell`;
    const lr = runCmd("osascript", ["-e", liveScript], { timeout: 6000 });
    if ((lr.stdout?.toString() || "").trim() === "live") {
      reviveSession(id); // 상태 정상화(dead=0), 실제 살아있었으니
      return Response.json({ ok: true, alreadyLive: true });
    }
  }

  // 기동 후 자동 전송할 메시지가 있으면 큐에 저장 (hook의 SessionStart 때 주입)
  if (text) revivePending.set(id, text);
  else revivePending.delete(id);

  // 탭 5개 미만인 기존 창이 있으면 새 탭, 전부 5개 이상(또는 창 없음)이면 새 창
  const cmd = `cd "${esc(s.cwd)}" && claude --resume ${esc(id)}`;
  const script = `tell application "iTerm2"
  set target to missing value
  repeat with w in windows
    if (count of tabs of w) < 5 then
      set target to w
      exit repeat
    end if
  end repeat
  if target is missing value then
    set target to (create window with default profile)
  else
    tell target to create tab with default profile
  end if
  tell current session of target to write text "${esc(cmd)}"
end tell
return "ok"`;
  const r = runCmd("osascript", ["-e", script]);

  reviveSession(id); // 💀 해제 (되살아나 이벤트를 보내면 상태도 갱신됨)

  return r.status === 0
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: r.stderr?.toString().trim() }, { status: 500 });
}
