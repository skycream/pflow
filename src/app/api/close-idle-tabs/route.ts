// Claude 세션이 아니고, 아무 작업도 안 도는(쉘 프롬프트만 있는) iTerm 탭을 닫는다.
// 안전장치: claude가 돌거나, 서버/수집 등 foreground 프로세스가 있는 탭은 절대 닫지 않는다.
// GET  = 닫을 후보 미리보기(dry-run)  |  POST = 실제로 닫기
import { runCmd } from "@/lib/osaEnv";

export const runtime = "nodejs";


// 이 이름들은 "아무것도 안 도는 쉘"로 간주 (닫아도 안전)
const SHELL_ONLY = /^(-?(zsh|bash|sh|fish)|login|ps|comm)$/;

type Tab = { guid: string; tty: string };

// 모든 iTerm 세션의 GUID+tty 수집
function allSessions(): Tab[] {
  const r = runCmd("osascript", [
    "-e",
    `tell application "iTerm2"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        set out to out & (id of s) & "|" & (tty of s) & "\\n"
      end repeat
    end repeat
  end repeat
  return out
end tell`,
  ]);
  return (r.stdout?.toString() || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [guid, tty] = l.split("|");
      return { guid, tty };
    })
    .filter((t) => t.tty?.startsWith("/dev/"));
}

// 그 tty에서 도는 프로세스 comm 목록
function procs(tty: string): string[] {
  const dev = tty.replace("/dev/", "");
  const r = runCmd("ps", ["-t", dev, "-o", "comm="]);
  return (r.stdout?.toString() || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((p) => p.replace(/^.*\//, "")); // 경로 제거 후 실행파일명만
}

// 닫아도 되는 "빈 쉘" 탭인가
function isIdleShell(tty: string): boolean {
  const list = procs(tty);
  if (list.length === 0) return false; // 조회 실패 시 보수적으로 유지
  // claude가 있으면 절대 닫지 않음
  if (list.some((p) => /^claude$/.test(p))) return false;
  // 쉘/기본 프로세스 외에 뭔가(서버·수집 등)가 있으면 유지
  return list.every((p) => SHELL_ONLY.test(p));
}

function candidates(): Tab[] {
  return allSessions().filter((t) => isIdleShell(t.tty));
}

export async function GET() {
  const c = candidates();
  return Response.json({ ok: true, count: c.length, tabs: c.map((t) => t.tty) });
}

export async function POST() {
  const c = candidates();
  if (c.length === 0) return Response.json({ ok: true, count: 0 });

  const list = c.map((t) => `"${t.guid}"`).join(", ");
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
  const r = runCmd("osascript", ["-e", script]);
  return r.status === 0
    ? Response.json({ ok: true, count: c.length })
    : Response.json({ ok: false, error: r.stderr?.toString().trim() }, { status: 500 });
}
