// 실시간 갱신 스트림 (SSE). 세션이 갱신될 때마다 해당 행을 푸시한다.
import { bus, type SessionRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true; // 이미 닫힌 컨트롤러
        }
      };

      safeEnqueue(`: connected\n\n`);

      const onUpdate = (row: SessionRow) => safeEnqueue(`data: ${JSON.stringify(row)}\n\n`);
      bus.on("update", onUpdate);

      const onDelete = (id: string) => safeEnqueue(`data: ${JSON.stringify({ __deleted: id })}\n\n`);
      bus.on("delete", onDelete);

      const keepAlive = setInterval(() => safeEnqueue(`: ping\n\n`), 25000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        bus.off("update", onUpdate);
        bus.off("delete", onDelete);
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우 무시
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
