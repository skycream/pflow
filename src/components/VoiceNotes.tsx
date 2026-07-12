"use client";

// 음성노트 뷰어 — data/voice-notes의 md 파일들을 날짜별·파일별 탭으로 보여준다.
// 메인 대시보드의 "음성노트" 탭 안에서 렌더된다 (상단 탭 바 유지).
import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";

type NoteFile = { name: string; content: string };
type NoteDate = { date: string; files: NoteFile[] };

export function VoiceNotes() {
  const [dates, setDates] = useState<NoteDate[]>([]);
  const [dateIdx, setDateIdx] = useState(0);
  const [fileIdx, setFileIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notes")
      .then((r) => r.json())
      .then((d) => setDates(d.dates ?? []))
      .finally(() => setLoading(false));
  }, []);

  const cur = dates[dateIdx];
  const file = cur?.files[fileIdx];

  if (loading) return <p className="mt-8 text-center text-zinc-400">불러오는 중…</p>;
  if (!cur)
    return (
      <p className="mt-8 text-center text-zinc-400">
        음성노트가 없어요 — data/voice-notes/&lt;날짜&gt;/*.md 에 저장하면 여기 떠요.
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 날짜 + 파일 탭 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 pt-1 text-sm dark:border-zinc-700">
        {dates.length > 1 && (
          <select
            value={dateIdx}
            onChange={(e) => {
              setDateIdx(Number(e.target.value));
              setFileIdx(0);
            }}
            className="mr-2 rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
          >
            {dates.map((d, i) => (
              <option key={d.date} value={i}>
                {d.date}
              </option>
            ))}
          </select>
        )}
        {dates.length === 1 && (
          <span className="mr-2 text-xs text-zinc-400 dark:text-zinc-500">{cur.date}</span>
        )}
        {cur.files.map((f, i) => (
          <button
            key={f.name}
            onClick={() => setFileIdx(i)}
            className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-1.5 font-medium ${
              i === fileIdx
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {f.name.replace(/^\d+-/, "")}
          </button>
        ))}
      </div>

      {/* 내용 */}
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <div className="mx-auto max-w-3xl rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          {file && <Markdown>{file.content}</Markdown>}
        </div>
      </div>
    </div>
  );
}
