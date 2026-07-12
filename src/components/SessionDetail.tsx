"use client";

import { useEffect, useState } from "react";
import type { SessionRow, StepRow } from "@/lib/db";
import { STATUS_META, relativeTime } from "@/lib/ui";
import { Markdown } from "@/components/Markdown";

// 클릭 복사 버튼
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
    >
      {copied ? "복사됨!" : "복사"}
    </button>
  );
}

export function SessionDetail({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [aliasInput, setAliasInput] = useState("");
  const [aliasSaved, setAliasSaved] = useState(false);
  const [sessAlias, setSessAlias] = useState("");
  const [sessAliasSaved, setSessAliasSaved] = useState(false);
  const [sendText, setSendText] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [tcOpen, setTcOpen] = useState(false);
  const [tcMsgs, setTcMsgs] = useState<{ role: string; text: string }[] | null>(null);

  function toggleTranscript() {
    const next = !tcOpen;
    setTcOpen(next);
    if (next && tcMsgs === null) {
      fetch(`/api/sessions/${sessionId}/transcript`)
        .then((r) => r.json())
        .then((d) => setTcMsgs(d.messages ?? []))
        .catch(() => setTcMsgs([]));
    }
  }

  function del() {
    if (!session) return;
    if (
      !confirm(
        `이 세션을 삭제할까요?\n${session.session_alias || session.project_name} (${session.session_id.slice(0, 8)})\n진행 기록도 함께 삭제됩니다.`,
      )
    )
      return;
    fetch(`/api/sessions/${session.session_id}`, { method: "DELETE" }).then(() => onClose());
  }

  function saveSessAlias() {
    if (!session) return;
    fetch("/api/session-alias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id, alias: sessAlias }),
    }).then(() => {
      setSession({ ...session, session_alias: sessAlias.trim() || null });
      setSessAliasSaved(true);
      setTimeout(() => setSessAliasSaved(false), 1500);
    });
  }

  function send() {
    if (!session || !sendText.trim()) return;
    fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id, text: sendText }),
    })
      .then((r) => r.json())
      .then((d) => {
        setSendMsg(d.ok ? "보냄 ✓" : `에러: ${d.error}`);
        if (d.ok) setSendText("");
        setTimeout(() => setSendMsg(""), 2500);
      })
      .catch(() => setSendMsg("전송 실패"));
  }

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((d) => {
        setSession(d.session ?? null);
        setSteps(d.steps ?? []);
        setAliasInput(d.session?.alias ?? "");
        setSessAlias(d.session?.session_alias ?? "");
        setNow(Date.now());
      })
      .catch(() => {});
  }, [sessionId]);

  function saveAlias() {
    if (!session) return;
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: session.project_root, alias: aliasInput }),
    }).then(() => {
      setSession({ ...session, alias: aliasInput.trim() || null });
      setAliasSaved(true);
      setTimeout(() => setAliasSaved(false), 1500);
    });
  }

  const resumeCmd = session
    ? `cd "${session.cwd}" && claude --resume ${session.session_id}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {!session ? (
          <p className="text-zinc-500 dark:text-zinc-400">불러오는 중…</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                  {session.alias || session.project_name}
                </h2>
                <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                  {session.project_name}/
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                ✕
              </button>
            </div>

            {/* 상태 */}
            <div className="mt-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_META[session.status].chip}`}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_META[session.status].dot}`} />
                {STATUS_META[session.status].label}
              </span>
            </div>

            {/* 리캡 (세션 총정리) */}
            {session.recap && (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  📋 리캡 (세션 총정리)
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                  {session.recap}
                </p>
              </div>
            )}

            {/* 명령 보내기 (tmux 양방향 제어) */}
            <div className="mt-5">
              <p className="mb-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                이 세션에 명령 보내기{" "}
                <span className="text-zinc-400 dark:text-zinc-500">(내가 친 것처럼 실행)</span>
              </p>
              {session.iterm_id || session.tty ? (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      value={sendText}
                      onChange={(e) => setSendText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") send();
                      }}
                      placeholder="프롬프트 입력 후 Enter / 보내기"
                      className="min-w-0 flex-1 rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                    />
                    <button
                      onClick={send}
                      className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      보내기
                    </button>
                  </div>
                  {sendMsg && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sendMsg}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  tmux에서 실행된 세션이 아니라 전송 불가. (tmux 안에서 claude를 띄우면 제어돼요)
                </p>
              )}
            </div>

            {/* 진행 과정 (트리) — 매 턴 [flow] 요약이 누적된 것 */}
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                진행 과정
              </p>
              {steps.length === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  아직 요약된 단계가 없어요. (세션이 [flow] 요약을 남기면 여기에 쌓입니다)
                </p>
              ) : (
                <ol className="relative space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-700">
                  {steps.map((s) => (
                    <li key={s.id} className="relative">
                      <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
                      <p className="text-sm text-zinc-800 dark:text-zinc-100">{s.text}</p>
                      <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                        {relativeTime(s.created_at, now)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* 세션 별명 (이 세션만) */}
            <div className="mt-5">
              <p className="mb-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                세션 별명 <span className="text-zinc-400 dark:text-zinc-500">(이 세션만)</span>
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={sessAlias}
                  onChange={(e) => setSessAlias(e.target.value)}
                  placeholder="예: 결제 리팩터"
                  className="min-w-0 flex-1 rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
                <button
                  onClick={saveSessAlias}
                  className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  {sessAliasSaved ? "저장됨!" : "저장"}
                </button>
              </div>
            </div>

            {/* 프로젝트 별명 */}
            <div className="mt-5">
              <p className="mb-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                프로젝트 별명{" "}
                <span className="text-zinc-400 dark:text-zinc-500">
                  (이 폴더의 모든 세션에 적용)
                </span>
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder={session.project_name}
                  className="min-w-0 flex-1 rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
                <button
                  onClick={saveAlias}
                  className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  {aliasSaved ? "저장됨!" : "저장"}
                </button>
              </div>
            </div>

            {/* 재접속 명령 */}
            <div className="mt-5">
              <p className="mb-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                세션이 끊겼다면 — 이 명령으로 재접속
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-600 dark:text-emerald-300">
                  {resumeCmd}
                </code>
                <CopyButton text={resumeCmd} />
              </div>
            </div>

            {/* 메타 정보 */}
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-400 dark:text-zinc-500">세션 ID</dt>
                <dd className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {session.session_id}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-400 dark:text-zinc-500">경로</dt>
                <dd
                  className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300"
                  title={session.cwd}
                >
                  {session.cwd}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-400 dark:text-zinc-500">단계</dt>
                <dd className="text-zinc-700 dark:text-zinc-200">{session.stage ?? "–"}</dd>
              </div>
            </dl>

            {/* 작업 내용 전체 (transcript) — 기본 접힘 */}
            <div className="mt-5">
              <button
                onClick={toggleTranscript}
                className="text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
              >
                {tcOpen ? "작업 내용 전체 ▴" : "작업 내용 전체 보기 ▾"}
              </button>
              {tcOpen && (
                <div className="mt-2 max-h-96 space-y-2.5 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                  {tcMsgs === null ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">불러오는 중…</p>
                  ) : tcMsgs.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">대화 기록 없음</p>
                  ) : (
                    tcMsgs.map((mmsg, i) => (
                      <div key={i}>
                        <p
                          className={`text-xs font-medium ${
                            mmsg.role === "user"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {mmsg.role === "user" ? "🧑 나" : "🤖 Claude"}
                        </p>
                        <Markdown>{mmsg.text}</Markdown>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 세션 삭제 (수동, 확인 후) */}
            <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <button
                onClick={del}
                className="text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
              >
                이 세션 삭제
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
