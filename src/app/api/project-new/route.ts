// 새 프로젝트 시작: ~/<이름> 폴더 생성 → git init → 새 iTerm 탭에서 claude 실행.
// SessionStart 훅이 잡히면 대시보드에 프로젝트/세션이 자동으로 나타난다.
import { spawnSync } from "node:child_process";
import { OSA_ENV } from "@/lib/osaEnv";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";


function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  // 폴더명 안전성: 한글/영문/숫자/-/_/공백만, 경로조작 문자 금지
  if (!name || !/^[\w가-힣][\w가-힣 .-]{0,50}$/.test(name) || name.includes("..")) {
    return Response.json(
      { ok: false, error: "프로젝트명은 한글/영문/숫자/-/_ 만 사용해요" },
      { status: 400 },
    );
  }

  const dir = path.join(os.homedir(), name);
  if (existsSync(dir)) {
    return Response.json({ ok: false, error: `이미 존재하는 폴더예요: ~/${name}` }, { status: 409 });
  }

  // 폴더 생성 + git init (프로젝트 루트 인식용)
  mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir, env: OSA_ENV });

  // iTerm에서 진입 → claude 실행.
  // 탭 5개 미만인 기존 창이 있으면 거기에 새 탭, 전부 5개 이상(또는 창 없음)이면 새 창.
  const cmd = `cd "${esc(dir)}" && claude`;
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
  -- 새로 만든 탭을 화면 앞으로 (창·탭 선택 + iTerm 활성화)
  select target
  tell current tab of target to select
  activate
end tell
return "ok"`;
  const r = spawnSync("osascript", ["-e", script], { env: OSA_ENV });
  return r.status === 0
    ? Response.json({ ok: true, dir })
    : Response.json(
        { ok: false, error: `iTerm 실행 실패: ${r.stderr?.toString().trim()}`, dir },
        { status: 500 },
      );
}
