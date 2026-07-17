// osascript / lsof / pgrep 등 시스템 도구를 spawn할 때 쓰는 공통 환경.
// launchd로 서버를 띄우면 PATH가 최소화돼 /usr/sbin(lsof 위치) 등이 빠진다.
// 모든 시스템 명령 실행이 이 ENV를 공유하도록 해서 "도구를 못 찾는" 버그를 원천 차단한다.
export const OSA_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH ?? ""}`,
};
