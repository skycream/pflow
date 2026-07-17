// iTerm 탭 제목을 각 세션의 프로젝트명(별칭 우선)으로 고정한다.
// claude가 제목을 바꿔도 대시보드가 주기적으로 되돌려, 창에서 어떤 프로젝트인지 항상 보이게.
import { spawnSync } from "node:child_process";
import { OSA_ENV } from "@/lib/osaEnv";
import os from "node:os";
import { getSessions } from "@/lib/db";

export const runtime = "nodejs";


function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST() {
  const home = os.homedir();
  // 대상: 살아있는(종료·죽음 아님) + iTerm 세션 + 홈루트(주기작업) 제외
  const targets = getSessions().filter(
    (s) =>
      s.status !== "ended" &&
      !s.dead &&
      s.project_root !== home &&
      (s.iterm_id || "").includes(":"),
  );
  if (targets.length === 0) return Response.json({ ok: true, count: 0 });

  // GUID → 표시할 제목(별칭 우선, 없으면 폴더명) 매핑을 AppleScript 리스트로
  const pairs = targets.map((s) => {
    const guid = esc((s.iterm_id || "").split(":").pop() || "");
    const title = esc(s.session_alias || s.project_name || "");
    return { guid, title };
  });

  // 한 번의 osascript로 모든 세션 제목 설정 (창/탭 순회는 1회)
  const setBlocks = pairs
    .map(
      (p) => `        if sid is "${p.guid}" then
          set name of s to "${p.title}"
        end if`,
    )
    .join("\n");

  const script = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        set sid to (id of s)
${setBlocks}
      end repeat
    end repeat
  end repeat
end tell
return "ok"`;

  const r = spawnSync("osascript", ["-e", script], { env: OSA_ENV });
  return r.status === 0
    ? Response.json({ ok: true, count: targets.length })
    : Response.json(
        { ok: false, error: r.stderr?.toString().trim() },
        { status: 500 },
      );
}
