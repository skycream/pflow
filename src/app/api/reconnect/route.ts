// 세션 재접속: 같은 iTerm 탭에서 claude 프로세스를 종료(kill)한 뒤 claude --resume으로 다시 들어간다.
// /exit는 종료 타이밍이 대화 크기에 따라 들쭉날쭉해 명령이 입력창에 새기 쉬우므로, 프로세스 kill로 확실히 종료한다.
// 스킬/설정을 새로 설치했는데 반영이 안 될 때, 재시작으로 다시 로드시키는 용도.
import { runCmd } from "@/lib/osaEnv";
import { getSession } from "@/lib/db";
import { scheduleResumeConfirm } from "@/lib/resumeConfirm";

export const runtime = "nodejs";


function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function osa(script: string): string {
  const r = runCmd("osascript", ["-e", script]);
  return (r.stdout?.toString() || "").trim();
}

export async function POST(req: Request) {
  let body: { session_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const id = String(body.session_id ?? "").trim();
  if (!id) return Response.json({ ok: false, error: "session_id 필요" }, { status: 400 });

  const s = getSession(id);
  if (!s) return Response.json({ ok: false, error: "세션 없음" }, { status: 404 });

  const itermId = s.iterm_id || "";
  if (!itermId.includes(":")) {
    return Response.json({ ok: false, error: "재접속은 iTerm 세션에서만 지원돼요" }, { status: 409 });
  }
  const guid = esc(itermId.split(":").pop() || "");

  // 1) 그 세션의 tty 조회
  const tty = osa(`tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with se in sessions of t
        if id of se is "${guid}" then return tty of se
      end repeat
    end repeat
  end repeat
  return ""
end tell`);
  if (!tty.startsWith("/dev/")) {
    // 탭이 이미 닫힘 → 되살리기처럼 폴백: 탭 5개 미만 창에 새 탭(없으면 새 창)으로 claude --resume
    const resumeCmd = esc(`cd "${esc(s.cwd || process.env.HOME || "~")}" && claude --resume ${id}`);
    const fb = runCmd("osascript", [
      "-e",
      `tell application "iTerm2"
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
  tell newSession to write text "${resumeCmd}"
  activate
  return (id of newSession)
end tell`,
    ]);
    // 새 탭의 GUID로 resume 확인 프롬프트를 정확히 겨냥해 자동 확정(논블로킹)
    const newGuid = (fb.stdout?.toString() || "").trim();
    if (newGuid) scheduleResumeConfirm(newGuid);
    return newGuid
      ? Response.json({ ok: true, reopened: true })
      : Response.json({ ok: false, error: "탭이 닫혀 있어 새로 열려 했지만 실패" }, { status: 500 });
  }

  // 2) 그 tty에서 실행 중인 claude 프로세스를 종료 (자식 MCP는 orphan으로 곧 정리됨)
  const dev = tty.replace("/dev/", "");
  const ps = runCmd("ps", ["-t", dev, "-o", "pid=,comm="]);
  const pids = (ps.stdout?.toString() || "")
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m && /(^|\/)claude$/.test(m[2]))
    .map((m) => m[1]);
  // SIGKILL(-9): SIGTERM은 "이 세션 어땠나요/Resume with…" 종료 피드백 화면을 띄우고 대기하므로
  // 그 화면과 명령이 충돌한다. -9로 즉시 죽여 곧바로 쉘 프롬프트로 떨어지게 한다.
  if (pids.length > 0) {
    runCmd("kill", ["-9", ...pids]);
  }

  // 3) 쉘 복귀를 잠깐 기다렸다가, 같은 탭에서 claude --resume 실행 (텍스트 → 딜레이 → Enter)
  const resume = esc(`claude --resume ${id}`);
  const r = runCmd(
    "osascript",
    [
      "-e",
      `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with se in sessions of t
        if id of se is "${guid}" then
          delay 1.5
          tell se to write text "${resume}"
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
  return "notfound"
end tell`,
    ],
    { timeout: 8000 }, // 내부 delay 1.9초(kill 대기+resume) + 여유
  );
  const out = (r.stdout?.toString() || "").trim();
  // resume 확인 프롬프트를 뒤에서 자동 확정(논블로킹)
  if (out === "ok") scheduleResumeConfirm(guid);
  return out === "ok"
    ? Response.json({ ok: true, killed: pids.length })
    : Response.json({ ok: false, error: "재접속 주입 실패" }, { status: 500 });
}
