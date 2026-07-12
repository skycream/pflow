// 실제 생존 기준 자동 판정: 각 세션의 claude가 진짜 실행 중인지 프로세스로 확인해 💀(dead)를 맞춘다.
// - working/waiting/compacting: 이벤트를 받는 중 = 확실히 살아있음 → dead 해제
// - idle/error: 프로세스(cwd 또는 resume-id)로 확인 → 없으면 죽음(💀), 있으면 해제
// - ended: SessionEnd로 종료된 것 → 건드리지 않음(별도 "종료" 표시)
import os from "node:os";
import { getSessions, markDead, reviveSession } from "@/lib/db";
import { runningClaude, normPath } from "@/lib/procCheck";

export const runtime = "nodejs";

export async function POST() {
  const { cwds, ids } = runningClaude();
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

    // idle/error: 실제 프로세스로 생존 판정
    const alive =
      ids.has(s.session_id.toLowerCase()) || cwds.has(normPath(s.cwd));
    const want = alive ? 0 : 1;
    if ((s.dead ? 1 : 0) !== want) {
      if (want) markDead(s.session_id);
      else reviveSession(s.session_id);
      changed++;
    }
  }

  return Response.json({ ok: true, changed });
}
