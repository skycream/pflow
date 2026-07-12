// 세션의 전체 대화(transcript)를 읽기 좋은 형태로 반환. 작업 내용 전체 보기용.
import { existsSync, readFileSync } from "node:fs";
import { getSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getSession(id);
  const tp = s?.transcript_path;
  if (!tp || !existsSync(tp)) return Response.json({ messages: [] });

  const lines = readFileSync(tp, "utf8").trim().split("\n");
  const messages: { role: string; text: string }[] = [];
  for (const line of lines) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = (o.message ?? o) as Record<string, unknown>;
    const role = (msg.role ?? o.type) as string;
    if (role !== "user" && role !== "assistant") continue;
    const c = msg.content;
    const parts: string[] = [];
    if (typeof c === "string") parts.push(c);
    else if (Array.isArray(c)) {
      for (const b of c as Array<Record<string, unknown>>) {
        if (b?.type === "text" && typeof b.text === "string") parts.push(b.text);
        else if (b?.type === "tool_use" && typeof b.name === "string") parts.push(`🔧 ${b.name}`);
      }
    }
    const text = parts.join("\n").trim();
    if (text) messages.push({ role, text });
  }

  // 너무 크면 최근 300개로 제한
  return Response.json({ messages: messages.slice(-300) });
}
