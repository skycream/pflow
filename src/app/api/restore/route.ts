// 세션 전체 복구: iTerm이 죽었을 때, 저장된 세션(cwd + Claude 세션 ID)으로
// 각 폴더에서 iTerm 탭을 열고 `claude --resume <id>`를 실행해 대화를 되살린다.
import { runCmd } from "@/lib/osaEnv";
import os from "node:os";
import { getSessions } from "@/lib/db";
import { runningClaude, normPath } from "@/lib/procCheck";

export const runtime = "nodejs";


function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST() {
  const home = os.homedir();
  // 복구 대상: 종료 안 됨 + 홈루트(주기작업) 제외 + cwd 있음
  const cands = getSessions().filter(
    (s) => s.status !== "ended" && s.project_root !== home && s.cwd,
  );
  if (cands.length === 0) return Response.json({ ok: true, count: 0 });

  // "그 대화가 실제로 살아있나"로 판정 — 탭만 살아있고 claude가 죽은 세션도 복구 대상.
  // resume-id가 매칭되거나(정확), 그 폴더에서 claude가 돌고 있으면(근사) 열림으로 간주.
  const { cwds, ids } = runningClaude();
  const dead = cands.filter(
    (s) => !ids.has(s.session_id.toLowerCase()) && !cwds.has(normPath(s.cwd)),
  );
  if (dead.length === 0) return Response.json({ ok: true, count: 0, allOpen: true });

  // 각 세션: cd "<cwd>" && claude --resume <id>  (닫힌 세션만)
  const cmds = dead.map((s) => `cd "${esc(s.cwd)}" && claude --resume ${esc(s.session_id)}`);

  // 윈도우당 탭 최대 7개로 묶기 (예: 15개 → 7 + 7 + 1, 윈도우 3개)
  const PER_WINDOW = 7;
  let script = `tell application "iTerm2"\n`;
  cmds.forEach((cmd, i) => {
    if (i % PER_WINDOW === 0) {
      // 새 윈도우 시작
      script += `  set w to (create window with default profile)\n`;
    } else {
      // 현재 윈도우에 탭 추가
      script += `  tell w to create tab with default profile\n`;
    }
    script += `  tell current session of w to write text "${esc(cmd)}"\n`;
  });
  script += `end tell\nreturn "ok"`;

  const r = runCmd("osascript", ["-e", script]);
  return r.status === 0
    ? Response.json({ ok: true, count: dead.length })
    : Response.json(
        { ok: false, count: dead.length, error: r.stderr?.toString().trim() },
        { status: 500 },
      );
}
