// 음성노트(data/voice-notes) 목록·내용 제공.
// 날짜 폴더 → md 파일들을 읽어 대시보드 /notes 페이지에 준다.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "data", "voice-notes");

export async function GET() {
  let dates: string[] = [];
  try {
    dates = (await readdir(ROOT, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse(); // 최신 날짜 먼저
  } catch {
    return Response.json({ ok: true, dates: [] }); // 폴더 없음 = 빈 목록
  }

  const result = [];
  for (const date of dates) {
    const dir = path.join(ROOT, date);
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
    } catch {
      continue;
    }
    const items = [];
    for (const f of files) {
      try {
        const content = await readFile(path.join(dir, f), "utf8");
        items.push({ name: f.replace(/\.md$/, ""), content });
      } catch {
        /* skip */
      }
    }
    result.push({ date, files: items });
  }
  return Response.json({ ok: true, dates: result });
}
