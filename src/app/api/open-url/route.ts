// 답변 속 링크를 사파리에서 연다. 단, 대시보드가 떠 있는 창(:3000 탭이 있는 창)에는
// 새 탭을 만들지 않는다 — 그러면 대시보드 탭이 뒤로 밀리고 포커스를 잃기 때문.
// 대신 "다른 사파리 창"의 새 탭으로 열고(없으면 새 창 생성), 대시보드 창은 앞에 유지한다.
import { runCmd } from "@/lib/osaEnv";

export const runtime = "nodejs";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const url = String(body.url ?? "").trim();
  // http/https만 허용 (file:// 등 로컬 스킴·명령 주입 차단)
  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ ok: false, error: "http(s) URL만 열 수 있어요" }, { status: 400 });
  }

  const u = esc(url);
  const script = `tell application "Safari"
  -- 대시보드가 있는 창(:3000 탭 보유)을 찾는다
  set dashWin to missing value
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains ":3000" then
        set dashWin to w
        exit repeat
      end if
    end repeat
    if dashWin is not missing value then exit repeat
  end repeat
  -- 대시보드 창이 아닌 다른 창을 대상으로
  set targetWin to missing value
  repeat with w in windows
    if dashWin is missing value or (w is not dashWin) then
      set targetWin to w
      exit repeat
    end if
  end repeat
  if targetWin is missing value then
    -- 다른 창이 없으면 새 창 생성
    make new document with properties {URL:"${u}"}
  else
    tell targetWin to set current tab to (make new tab with properties {URL:"${u}"})
  end if
  -- 대시보드 창은 앞에 유지 → 포커스가 대시보드에 남는다
  if dashWin is not missing value then set index of dashWin to 1
end tell
return "ok"`;

  const r = runCmd("osascript", ["-e", script], { timeout: 8000 });
  if (r.status === 0 && (r.stdout?.toString() || "").trim() === "ok") {
    return Response.json({ ok: true });
  }
  // 폴백: 스크립팅 실패 시 기본 방식
  const fb = runCmd("open", ["-a", "Safari", url]);
  return fb.status === 0
    ? Response.json({ ok: true, viaFallback: true })
    : Response.json({ ok: false, error: r.stderr?.toString().trim() }, { status: 500 });
}
