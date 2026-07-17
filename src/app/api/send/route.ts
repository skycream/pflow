// 대시보드 → 세션 양방향 제어.
// iTerm2(iterm_id) 또는 Apple Terminal(tty)에 AppleScript로 프롬프트를 주입한다.
import { runCmd } from "@/lib/osaEnv";
import { getSession, recordSent } from "@/lib/db";

export const runtime = "nodejs";


// AppleScript 문자열 이스케이프 (백슬래시, 큰따옴표)
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runOsa(script: string): { ok: boolean; out: string } {
  const r = runCmd("osascript", ["-e", script]);
  const out = (r.stdout?.toString() || "").trim();
  const err = (r.stderr?.toString() || "").trim();
  return { ok: r.status === 0 && out !== "notfound", out: out || err };
}

export async function POST(req: Request) {
  let body: {
    session_id?: string;
    text?: string;
    enter?: boolean;
    display?: string;
    sequence?: string[]; // 다중 질문 답변: 숫자키들을 딜레이 두고 차례로 → 마지막 Enter 제출
    escKey?: boolean; // Esc 키 주입(중단)
    escThenText?: boolean; // AskUserQuestion 위젯을 Esc로 닫고 자유 텍스트로 답변
    modelSwitch?: string; // 모델 변경: /model <별칭> 실행 후 전환 확인(엔터) 자동 처리
    silent?: boolean; // 보낸 요청 기록 생략(자동 재시도용)
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const { session_id, text, enter, display, sequence, escKey, escThenText, modelSwitch, silent } =
    body;
  const hasSeq = Array.isArray(sequence) && sequence.length > 0;
  if (!session_id || (!text && !hasSeq && !escKey && !modelSwitch)) {
    return Response.json({ ok: false, error: "session_id, text/sequence 필요" }, { status: 400 });
  }

  const session = getSession(session_id);
  if (!session) return Response.json({ ok: false, error: "세션 없음" }, { status: 404 });

  // 보낸 요청을 영구 기록 (사람이 읽을 display 우선). silent면 생략(자동 재시도).
  if (!silent) recordSent(session_id, display || text || (sequence ?? []).join(",") || "Esc");

  const safe = esc(text ?? "");

  const itermId = session.iterm_id || "";

  // Esc 키(중단): iTerm은 character id 27, Terminal.app은 미지원
  if (escKey) {
    if (!itermId.includes(":")) {
      return Response.json({ ok: false, error: "중단은 iTerm 세션에서만 지원돼요" }, { status: 409 });
    }
    const guid = esc(itermId.split(":").pop() || "");
    const script = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${guid}" then
          tell s to write text (character id 27) newline no
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "notfound"`;
    const r = runOsa(script);
    return r.ok
      ? Response.json({ ok: true, via: "iterm-esc" })
      : Response.json({ ok: false, error: `중단 실패: ${r.out}` }, { status: 500 });
  }

  // 모델 변경: /model <별칭> 실행 → 잠깐 대기 → 전환 확인(빈 엔터=기본값 Yes) 자동 확정 (iTerm만 지원)
  // 확인 프롬프트가 안 뜨는 경우엔 무해한 빈 엔터라 오입력 위험 없음.
  if (modelSwitch) {
    if (!itermId.includes(":")) {
      return Response.json(
        { ok: false, error: "모델 변경은 iTerm 세션에서만 지원돼요" },
        { status: 409 },
      );
    }
    const guid = esc(itermId.split(":").pop() || "");
    const m = esc(modelSwitch);
    const script = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${guid}" then
          tell s to write text "/model ${m}" newline no
          delay 0.4
          tell s to write text "" newline yes
          delay 1.6
          tell s to write text "" newline yes
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "notfound"`;
    const r = runOsa(script);
    return r.ok
      ? Response.json({ ok: true, via: "iterm-model" })
      : Response.json({ ok: false, error: `iTerm 주입 실패: ${r.out}` }, { status: 500 });
  }

  // AskUserQuestion 위젯을 Esc로 닫고 자유 텍스트로 답변 (iTerm만 지원)
  // 선택지에 원하는 답이 없을 때: 위젯 취소 → 자연어 답변을 한 번에 전송
  if (escThenText && text) {
    if (!itermId.includes(":")) {
      return Response.json(
        { ok: false, error: "자유 답변은 iTerm 세션에서만 지원돼요" },
        { status: 409 },
      );
    }
    const guid = esc(itermId.split(":").pop() || "");
    const script = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${guid}" then
          tell s to write text (character id 27) newline no
          delay 0.5
          tell s to write text "${safe}" newline no
          delay 0.4
          tell s to write text "" newline yes
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "notfound"`;
    const r = runOsa(script);
    return r.ok
      ? Response.json({ ok: true, via: "iterm-esc-text" })
      : Response.json({ ok: false, error: `iTerm 주입 실패: ${r.out}` }, { status: 500 });
  }

  // 다중 질문(AskUserQuestion): 숫자키를 0.3초 간격으로 → 마지막에 Enter로 제출 (iTerm만 지원)
  if (hasSeq) {
    if (!itermId.includes(":")) {
      return Response.json(
        { ok: false, error: "다중 질문 응답은 iTerm 세션에서만 지원돼요" },
        { status: 409 },
      );
    }
    const guid = esc(itermId.split(":").pop() || "");
    const lines = sequence!
      .map((k) => `          tell s to write text "${esc(String(k))}" newline no\n          delay 0.35`)
      .join("\n");
    const script = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${guid}" then
${lines}
          tell s to write text "" newline yes
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "notfound"`;
    const r = runOsa(script);
    return r.ok
      ? Response.json({ ok: true, via: "iterm-seq" })
      : Response.json({ ok: false, error: `iTerm 주입 실패: ${r.out}` }, { status: 500 });
  }

  // 1순위: iTerm2
  if (itermId.includes(":")) {
    const guid = esc(itermId.split(":").pop() || "");
    // Claude Code 입력창은 텍스트+개행이 한 번에 오면 붙여넣기(줄바꿈)로 인식한다.
    // 그래서 텍스트를 먼저 넣고(newline no) → 잠깐 대기 → 엔터만 따로 보낸다.
    const submit =
      enter === false
        ? ""
        : `\n          delay 0.4\n          tell s to write text "" newline yes`;
    const script = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${guid}" then
          tell s to write text "${safe}" newline no${submit}
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "notfound"`;
    const r = runOsa(script);
    return r.ok
      ? Response.json({ ok: true, via: "iterm" })
      : Response.json({ ok: false, error: `iTerm 주입 실패: ${r.out}` }, { status: 500 });
  }

  // 2순위: Apple Terminal (do script는 항상 Enter 포함)
  if (session.tty) {
    const tty = esc(session.tty);
    const script = `tell application "Terminal"
  repeat with w in windows
    repeat with t in tabs of w
      if tty of t is "${tty}" then
        do script "${safe}" in t
        return "ok"
      end if
    end repeat
  end repeat
end tell
return "notfound"`;
    const r = runOsa(script);
    return r.ok
      ? Response.json({ ok: true, via: "terminal" })
      : Response.json({ ok: false, error: `Terminal 주입 실패: ${r.out}` }, { status: 500 });
  }

  return Response.json(
    { ok: false, error: "제어 핸들 없음 (iTerm/Terminal에서 세션을 새로 켜야 캡처됨)" },
    { status: 409 },
  );
}
