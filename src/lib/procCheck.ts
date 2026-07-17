// 실제로 살아있는 claude 대화를 프로세스에서 식별 (탭/훅이 아니라 진짜 생존 기준).
import { spawnSync } from "node:child_process";

import { OSA_ENV as ENV } from "./osaEnv";

// 경로 정규화: 끝 슬래시 제거
export function normPath(p: string): string {
  return p.replace(/\/+$/, "");
}

// - cwds: claude가 실행 중인 작업폴더 집합
// - ids:  `claude --resume <id>`로 떠 있는 세션 id 집합 (더 정확한 매칭)
export function runningClaude(): { cwds: Set<string>; ids: Set<string> } {
  const cwds = new Set<string>();
  const ids = new Set<string>();
  const pg = spawnSync("pgrep", ["-x", "claude"], { env: ENV });
  const pids = (pg.stdout?.toString() || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (pids.length === 0) return { cwds, ids };

  // 각 PID의 cwd를 한 번의 lsof로 (-p는 콤마 구분 다중 PID 지원)
  const ls = spawnSync("lsof", ["-a", "-p", pids.join(","), "-d", "cwd", "-Fn"], { env: ENV });
  for (const line of (ls.stdout?.toString() || "").split("\n")) {
    if (line.startsWith("n/")) cwds.add(normPath(line.slice(1)));
  }

  // `claude --resume <id>` 로 뜬 세션 id 추출 (명령줄에 id가 그대로 노출됨)
  const ps = spawnSync("ps", ["-Ao", "args="], { env: ENV });
  const idRe = /claude(?:\s+\S+)*\s+(?:--resume|-r)\s+([0-9a-f-]{36})/i;
  for (const line of (ps.stdout?.toString() || "").split("\n")) {
    const m = line.match(idRe);
    if (m) ids.add(m[1].toLowerCase());
  }
  return { cwds, ids };
}
