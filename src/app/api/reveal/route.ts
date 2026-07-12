// 세션의 iTerm 탭을 찾아 화면 앞으로 가져온다 (이미 열린 세션으로 "이동").
// 복구가 "이미 열림"으로 스킵한 세션을, 사용자가 창 더미에서 못 찾을 때 바로 띄워준다.
import { spawnSync } from "node:child_process";
import { getSession } from "@/lib/db";

export const runtime = "nodejs";

const ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`,
};

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(req: Request) {
  let body: { session_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const sessionId = String(body.session_id ?? "").trim();
  if (!sessionId) return Response.json({ ok: false, error: "session_id 필요" }, { status: 400 });

  const session = getSession(sessionId);
  if (!session) return Response.json({ ok: false, error: "세션 없음" }, { status: 404 });

  const itermId = session.iterm_id || "";
  if (!itermId.includes(":")) {
    return Response.json(
      { ok: false, error: "iTerm 세션이 아니라 화면 이동을 지원하지 않아요" },
      { status: 409 },
    );
  }

  // 해당 GUID의 세션이 있는 창·탭을 선택하고 iTerm을 앞으로
  const guid = esc(itermId.split(":").pop() || "");
  const script = `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${guid}" then
          select w
          tell t to select
          tell s to select
          activate
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "notfound"`;
  const r = spawnSync("osascript", ["-e", script], { env: ENV });
  const out = (r.stdout?.toString() || "").trim();
  if (r.status === 0 && out === "ok") {
    return Response.json({ ok: true });
  }
  // notfound = 그 탭이 실제로 닫힘 → 복구가 필요한 상태
  if (out === "notfound") {
    return Response.json(
      { ok: false, notfound: true, error: "그 탭이 닫혀 있어요 — '세션 복구'로 다시 띄우세요" },
      { status: 404 },
    );
  }
  return Response.json(
    { ok: false, error: `이동 실패: ${(r.stderr?.toString() || out).trim()}` },
    { status: 500 },
  );
}
