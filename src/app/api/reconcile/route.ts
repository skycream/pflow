// 실제 생존 기준 자동 판정: 각 세션의 claude가 진짜 실행 중인지 프로세스로 확인해 💀(dead)를 맞춘다.
// - working/waiting/compacting: 이벤트를 받는 중 = 확실히 살아있음 → dead 해제
// - idle/error: 프로세스(cwd 또는 resume-id)로 확인 → 없으면 죽음(💀), 있으면 해제
// - ended: SessionEnd로 종료된 것 → 건드리지 않음(별도 "종료" 표시)
import os from "node:os";
import { getSessions, markDead, reviveSession } from "@/lib/db";
import { runningClaude, normPath, claudeTabGuids } from "@/lib/procCheck";

export const runtime = "nodejs";

export async function POST() {
  const { cwds, ids, reliable } = runningClaude();
  const tabGuids = claudeTabGuids(); // 탭 기준 생존 신호(cd 이동에 안 흔들림)
  const home = os.homedir();
  let changed = 0;

  for (const s of getSessions()) {
    if (s.status === "ended" || !s.cwd || s.project_root === home) continue;

    // 활성 상태는 확실히 살아있음 — 프로세스 조회 없이 dead만 해제
    if (s.status === "working" || s.status === "waiting" || s.status === "compacting") {
      if (s.dead) {
        reviveSession(s.session_id);
        changed++;
      }
      continue;
    }

    // idle/error: 실제 프로세스로 생존 판정.
    // cwd 매칭은 정확일치가 아니라 "프로젝트 루트 공유"로 판정한다 — 세션이 claude 안에서
    // cd로 폴더를 옮기면(예: 프로젝트/site 하위로) DB cwd와 실시간 lsof cwd가 어긋나
    // 살아있는데 죽음으로 오판하기 때문. 같은 project_root 아래면 살아있는 것으로 본다.
    const sRoot = normPath(s.project_root || s.cwd);
    const cwdAlive = [...cwds].some((c) => {
      const nc = normPath(c);
      return nc === sRoot || nc.startsWith(sRoot + "/"); // 루트 자체이거나 그 하위
    });
    // 가장 정확한 신호: 이 세션의 iTerm 탭에서 claude가 실제로 돌고 있는가.
    // 세션이 claude 안에서 cd로 폴더를 옮기면 cwd 매칭은 어긋나지만 이건 안 어긋난다.
    const guid = (s.iterm_id || "").split(":").pop() || "";
    const tabAlive = !!guid && tabGuids.has(guid);
    const alive = ids.has(s.session_id.toLowerCase()) || tabAlive || cwdAlive;
    // 조회가 불안정(도구 실패)하면 "죽음" 판정은 보류 — 살아있는데 죽음으로 찍는 오탐 방지.
    // 단 "살아있음"으로 dead 해제하는 건 안전하니 허용.
    if (!alive && !reliable) continue;
    const want = alive ? 0 : 1;
    if ((s.dead ? 1 : 0) !== want) {
      if (want) markDead(s.session_id);
      else reviveSession(s.session_id);
      changed++;
    }
  }

  return Response.json({ ok: true, changed, reliable });
}
