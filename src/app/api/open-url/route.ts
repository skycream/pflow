// 답변 속 링크를 사파리 새 탭에서 연다. 대시보드(브라우저 내)에서 직접 열면 기본 브라우저로
// 가버리므로, 서버가 `open -a Safari <url>`로 확실히 사파리에서 띄운다.
import { runCmd } from "@/lib/osaEnv";

export const runtime = "nodejs";

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
  // open은 인자 배열로 전달 → 셸 해석 없음(주입 안전)
  const r = runCmd("open", ["-a", "Safari", url]);
  return r.status === 0
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: r.stderr?.toString().trim() }, { status: 500 });
}
