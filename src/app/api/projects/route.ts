// 프로젝트(폴더) 별명 저장. { root, alias }
import { setProjectAlias } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { root?: string; alias?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.root) {
    return Response.json({ ok: false, error: "root required" }, { status: 400 });
  }
  setProjectAlias(body.root, typeof body.alias === "string" ? body.alias : "");
  return Response.json({ ok: true });
}
