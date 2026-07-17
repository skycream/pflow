// osascript / lsof / pgrep 등 시스템 도구를 spawn할 때 쓰는 공통 환경·옵션.
// launchd로 서버를 띄우면 PATH가 최소화돼 /usr/sbin(lsof 위치) 등이 빠진다.
// 모든 시스템 명령 실행이 이 ENV를 공유하도록 해서 "도구를 못 찾는" 버그를 원천 차단한다.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export const OSA_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH ?? ""}`,
};

// 공통 spawnSync: ENV + timeout을 항상 적용한다.
// spawnSync는 Node 메인 스레드를 블록하므로, 하나가 멈추면 서버 전체가 얼어붙는다.
// timeout으로 최대 대기를 강제해 그 사태를 막는다. killSignal로 확실히 종료.
export function runCmd(
  cmd: string,
  args: string[],
  opts: { timeout?: number; cwd?: string } = {},
): SpawnSyncReturns<Buffer> {
  return spawnSync(cmd, args, {
    env: OSA_ENV,
    timeout: opts.timeout ?? 10000, // 기본 10초
    killSignal: "SIGKILL",
    cwd: opts.cwd,
  });
}

// spawn 자체가 실패했는지(도구 못 찾음·타임아웃 등) 판정. 명령 실패(비정상 종료)와 구분.
export function spawnFailed(r: SpawnSyncReturns<Buffer>): boolean {
  return r.error != null || r.status == null;
}
