// 실제로 살아있는 claude 대화를 프로세스에서 식별 (탭/훅이 아니라 진짜 생존 기준).
import { realpathSync } from "node:fs";
import { runCmd, spawnFailed } from "./osaEnv";

// lsof는 다중 PID 조회 시 비ASCII(한글 등)를 \xNN 형태로 이스케이프해 반환한다
// (단일 PID일 땐 raw). 이걸 디코드하지 않으면 한글 폴더 경로 매칭이 실패해
// "살아있는데 죽음으로 오판"하는 버그가 난다. \xNN 바이트열을 UTF-8로 복원한다.
function decodeLsof(s: string): string {
  if (!s.includes("\\x")) return s;
  const bytes = s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

// 경로 정규화: lsof 이스케이프 디코드 + 끝 슬래시 제거 + 심링크 해소(/tmp→/private/tmp 등).
// realpath가 실패하면(존재 안 함 등) 슬래시만 정리.
export function normPath(p: string): string {
  const trimmed = decodeLsof(p).replace(/\/+$/, "");
  try {
    return realpathSync(trimmed);
  } catch {
    return trimmed;
  }
}

// - cwds: claude가 실행 중인 작업폴더 집합
// - ids:  `claude --resume <id>`로 떠 있는 세션 id 집합 (더 정확한 매칭)
// - reliable: 프로세스 조회가 신뢰할 만한가. false면 조회 실패(도구 못 찾음/타임아웃)로
//             빈 결과일 수 있으니, 호출부는 이때 "죽음" 판정을 내리면 안 된다.
export function runningClaude(): { cwds: Set<string>; ids: Set<string>; reliable: boolean } {
  const cwds = new Set<string>();
  const ids = new Set<string>();

  // ps로 전체 프로세스 args를 받아 claude 관련 PID·resume-id를 추출 (pgrep보다 견고).
  const ps = runCmd("ps", ["-Ao", "pid=,args="]);
  if (spawnFailed(ps)) return { cwds, ids, reliable: false };

  const claudePids: string[] = [];
  const idRe = /claude(?:\s+\S+)*\s+(?:--resume|-r)\s+([0-9a-f-]{36})/i;
  // claude 실행파일(경로 끝이 /claude 또는 정확히 claude)인 프로세스
  const claudeProcRe = /^\s*(\d+)\s+(.*\/claude|claude)(\s|$)/;
  for (const line of (ps.stdout?.toString() || "").split("\n")) {
    const m = line.match(idRe);
    if (m) ids.add(m[1].toLowerCase());
    const pm = line.match(claudeProcRe);
    if (pm) claudePids.push(pm[1]);
  }

  if (claudePids.length === 0) {
    // ps는 성공했으니 신뢰 가능 — 진짜로 claude가 없는 상태.
    return { cwds, ids, reliable: true };
  }

  // 각 PID의 cwd를 한 번의 lsof로 (-p는 콤마 구분 다중 PID 지원)
  const ls = runCmd("lsof", ["-a", "-p", claudePids.join(","), "-d", "cwd", "-Fn"]);
  if (spawnFailed(ls)) {
    // lsof 실패 → cwd 매칭은 불가하지만 resume-id 매칭은 유효. cwd 판정은 신뢰 불가로 표시.
    return { cwds, ids, reliable: false };
  }
  for (const line of (ls.stdout?.toString() || "").split("\n")) {
    if (line.startsWith("n/")) cwds.add(normPath(line.slice(1)));
  }

  return { cwds, ids, reliable: true };
}
