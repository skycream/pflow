// 드롭한 이미지를 로컬 디스크에 저장하고 절대경로를 돌려준다.
// 그 경로를 세션 입력에 주입하면 Claude Code가 터미널 드래그처럼 이미지를 읽는다.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

// 업로드 최대 크기 (100MB). arrayBuffer로 통째 메모리 로드하므로 상한이 없으면 서버 OOM.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "파일 없음" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { ok: false, error: `파일이 너무 큽니다 (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  const dir = path.join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });

  // 파일명 정리 + 충돌 방지(타임스탬프)
  const base = (file.name || "image").replace(/[^\w.\-가-힣]/g, "_").slice(-80);
  const dest = path.join(dir, `${Date.now()}_${base}`);
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));

  return Response.json({ ok: true, path: dest, name: file.name || base });
}
