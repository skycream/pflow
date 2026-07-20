// `claude --resume`은 오래되거나 큰 세션에서 확인 프롬프트를 띄우고 멈춘다:
//   "This session is 6d old and 127k tokens ... ❯ 1. Resume from summary (recommended)
//    2. Resume full session as-is  3. Don't ask me again"
// 아무도 답하지 않으면 그 화면에서 대기만 해서 "되살리기를 눌러도 접속이 안 되는" 상태가 된다.
// claude 부팅 시간이 들쭉날쭉하므로, 엔터를 여러 시점에 나눠 보내 기본값(추천=요약 재개)으로 확정한다.
//
// 중요: spawnSync는 서버 메인 스레드를 막으므로 긴 delay를 osascript 안에 넣으면 대시보드가 멈춘다.
// 그래서 응답은 즉시 반환하고, 확인 엔터만 setTimeout으로 뒤에서 보낸다(fire-and-forget).
import { runCmd } from "./osaEnv";

// 프롬프트가 안 떠 있으면 빈 엔터라 무해하다. 부팅이 느린 경우까지 커버하도록 여러 번.
const CONFIRM_DELAYS_MS = [4000, 8000, 13000];

function sendEnter(guid: string): void {
  runCmd(
    "osascript",
    [
      "-e",
      `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with se in sessions of t
        if id of se is "${guid}" then
          tell se to write text "" newline yes
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
  return "notfound"
end tell`,
    ],
    { timeout: 5000 },
  );
}

// 해당 iTerm 세션(GUID)에 확인 엔터를 예약 전송한다. 즉시 반환(논블로킹).
export function scheduleResumeConfirm(guid: string): void {
  if (!guid) return;
  for (const ms of CONFIRM_DELAYS_MS) {
    setTimeout(() => {
      try {
        sendEnter(guid);
      } catch {
        /* 베스트에포트 */
      }
    }, ms).unref?.();
  }
}

