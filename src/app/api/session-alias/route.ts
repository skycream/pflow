// 세션 개별 별명 저장. { session_id, alias }
import { setSessionAlias } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { session_id?: string; alias?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.session_id) {
    return Response.json({ ok: false, error: "session_id required" }, { status: 400 });
  }
  setSessionAlias(body.session_id, typeof body.alias === "string" ? body.alias : "");
  return Response.json({ ok: true });
}
