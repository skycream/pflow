// 세션 상세: 세션 1건 + 최근 이벤트 타임라인.
import { getSession, getEvents, getSteps, deleteSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ session, steps: getSteps(id), events: getEvents(id) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  deleteSession(id);
  return Response.json({ ok: true });
}
