// 죽은(💀) 세션 하나를 되살린다: 새 iTerm 탭에서 해당 폴더로 이동해 claude --resume 실행.
// dead=0으로 되돌리고, 세션이 다시 이벤트를 보내면 상태도 자동 정상화된다.
import { runCmd } from "@/lib/osaEnv";
import { getSession, reviveSession } from "@/lib/db";
import { revivePending } from "@/lib/revivePending";
import { scheduleResumeConfirm } from "@/lib/resumeConfirm";

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

  // 그 세션의 iTerm 탭이 아직 열려 있는지 + 그 안에서 claude가 실제로 도는지 확인한다.
  // 탭 존재만 보면 안 된다 — claude만 종료되고 쉘 프롬프트로 남은 탭이 흔한데,
  // 그걸 "살아있음"으로 오인하면 포커스만 하고 resume을 안 보내 되살리기가 먹통이 된다.
  const guid = esc((s.iterm_id || "").split(":").pop() || "");
  if (guid) {
    const tty = (
      runCmd("osascript", [
        "-e",
        `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with se in sessions of t
        if id of se is "${guid}" then return tty of se
      end repeat
    end repeat
  end repeat
  return ""
end tell`,
      ]).stdout?.toString() || ""
    ).trim();

    if (tty.startsWith("/dev/")) {
      const dev = tty.replace("/dev/", "");
      const ps = runCmd("ps", ["-t", dev, "-o", "comm="]);
      const claudeRunning = (ps.stdout?.toString() || "")
        .split("\n")
        .some((l) => /(^|\/)claude$/.test(l.trim()));

      // 그 탭을 재사용한다: claude가 이미 돌면 포커스(+메시지), 죽었으면 resume으로 재접속.
      const inject = claudeRunning
        ? text
          ? `\n          tell se to write text "${esc(text)}" newline no\n          delay 0.4\n          tell se to write text "" newline yes`
          : ""
        : // 대상이 "쉘"이므로 명령+개행을 한 번에 보낸다.
          // (텍스트/엔터를 쪼개 보내는 건 claude 입력창용 방식이라, 쉘에선 출력과 섞여 명령이 깨진다.)
          // resume 확인 프롬프트 확정은 scheduleResumeConfirm이 뒤에서 처리(논블로킹).
          `\n          tell se to write text "cd \\"${esc(s.cwd)}\\" && claude --resume ${esc(id)}"`;

      // claude를 새로 띄우는 경우, 기동 후 보낼 메시지는 SessionStart 훅에서 주입한다.
      if (!claudeRunning && text) revivePending.set(id, text);

      const r2 = runCmd(
        "osascript",
        [
          "-e",
          `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with se in sessions of t
        if id of se is "${guid}" then
          select w
          tell t to select
          activate${inject}
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
  return "notfound"
end tell`,
        ],
        { timeout: 8000 },
      );
      if ((r2.stdout?.toString() || "").trim() === "ok") {
        // claude를 새로 띄운 경우, resume 확인 프롬프트를 뒤에서 자동 확정
        if (!claudeRunning) scheduleResumeConfirm(guid);
        reviveSession(id); // 💀 해제
        return Response.json({
          ok: true,
          reusedTab: true,
          alreadyLive: claudeRunning,
        });
      }
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
  set newSession to current session of target
  tell newSession to write text "${esc(cmd)}"
  select target
  tell current tab of target to select
  activate
  return (id of newSession)
end tell`;
  const r = runCmd("osascript", ["-e", script]);
  // 새로 만든 탭의 GUID로 resume 확인 프롬프트를 정확히 겨냥해 자동 확정(논블로킹).
  // "현재 창"에 보내면 그 사이 포커스가 바뀌었을 때 엉뚱한 탭에 엔터가 간다.
  const newGuid = (r.stdout?.toString() || "").trim();
  if (r.status === 0 && newGuid) scheduleResumeConfirm(newGuid);

  reviveSession(id); // 💀 해제 (되살아나 이벤트를 보내면 상태도 갱신됨)

  return r.status === 0
    ? Response.json({ ok: true, newTab: true })
    : Response.json({ ok: false, error: r.stderr?.toString().trim() }, { status: 500 });
}
