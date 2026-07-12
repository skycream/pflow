"use client";

// 세션별 골(목표) + 워크플로우(게이트 기반 상태머신).
// - 일반 단계: 턴 끝나면 자동으로 다음 단계 전송.
// - 게이트(✋) 단계: 끝나면 멈추고 내 승인을 기다림(산출물 검토).
// - 루프(🔁) 단계: 끝나면 "다음 슬라이스(반복)" / "다음 단계로"를 내가 고름.
import { useEffect, useRef, useState } from "react";
import type { SessionRow } from "@/lib/db";
import { BUILD_PIPELINE, UNKNOWNS_PIPELINE, type WfStep, type WfTemplate } from "@/lib/buildPipeline";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function inject(sessionId: string, text: string, display: string, enter = true) {
  await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, text, enter, display }),
  }).catch(() => {});
}

// 구버전(string[]) → WfStep[] 호환
function normSteps(raw: unknown): WfStep[] {
  if (!Array.isArray(raw)) return [{ text: "" }];
  const out = raw.map((s) =>
    typeof s === "string" ? { text: s } : (s as WfStep),
  );
  return out.length ? out : [{ text: "" }];
}

export function SessionWorkflow({ session }: { session: SessionRow }) {
  const sid = session.session_id;
  const [panel, setPanel] = useState<"goal" | "wf" | null>(null);

  // ── 골(목표) ──
  const [goal, setGoal] = useState("");
  useEffect(() => setGoal(load(`flow-goal-${sid}`, "")), [sid]);
  function saveGoal(v: string) {
    setGoal(v);
    localStorage.setItem(`flow-goal-${sid}`, JSON.stringify(v));
  }
  function injectGoal() {
    if (!goal.trim()) return;
    inject(sid, `이 세션의 목표: ${goal.trim()}\n이 목표를 향해 진행해줘.`, "🎯 목표 주입");
  }

  // ── 워크플로우 ──
  const [steps, setSteps] = useState<WfStep[]>([{ text: "" }]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false); // 게이트/루프에서 승인 대기
  const [wfIndex, setWfIndex] = useState(0);
  const runStepsRef = useRef<WfStep[]>([]); // 실행 시작 시점의 스텝 스냅샷
  const sentAtRef = useRef(0);

  useEffect(() => {
    setSteps(normSteps(load(`flow-wf-${sid}`, null)));
    setRunning(false);
    setPaused(false);
    setWfIndex(0);
  }, [sid]);

  function saveSteps(next: WfStep[]) {
    setSteps(next);
    localStorage.setItem(`flow-wf-${sid}`, JSON.stringify(next));
  }
  function loadTemplate(tpl: WfTemplate = BUILD_PIPELINE) {
    if (steps.some((s) => s.text.trim()) && !confirm(`현재 단계를 '${tpl.name}'으로 덮어쓸까요?`))
      return;
    saveSteps(tpl.steps.map((s) => ({ ...s })));
  }

  const liveSteps = steps.filter((s) => s.text.trim());

  function sendStep(list: WfStep[], i: number) {
    sentAtRef.current = Date.now();
    const s = list[i];
    const tag = s.gate ? "✋" : s.loop ? "🔁" : "▶";
    inject(sid, s.text, `${tag} ${i + 1}/${list.length}: ${(s.label || s.text).slice(0, 30)}`);
  }
  function runWorkflow() {
    const list = liveSteps;
    if (!list.length) return;
    saveSteps(steps);
    runStepsRef.current = list;
    setWfIndex(0);
    setPaused(false);
    setRunning(true);
    sendStep(list, 0);
  }
  function stopWorkflow() {
    setRunning(false);
    setPaused(false);
  }
  // 게이트/루프에서 승인 → 다음 단계
  function approveNext() {
    const list = runStepsRef.current;
    const next = wfIndex + 1;
    setPaused(false);
    if (next < list.length) {
      setWfIndex(next);
      sendStep(list, next);
    } else {
      setRunning(false);
    }
  }
  // 루프: 같은 단계 다시(다음 슬라이스)
  function repeatStep() {
    setPaused(false);
    sendStep(runStepsRef.current, wfIndex);
  }

  // 턴 완료(Stop/idle) 감지 → 자동 진행 or 게이트에서 멈춤
  useEffect(() => {
    if (!running || paused) return;
    const list = runStepsRef.current;
    const done =
      (session.last_stop_at != null && session.last_stop_at > sentAtRef.current) ||
      (session.status === "idle" && session.last_event_at > sentAtRef.current);
    if (!done) return;
    const cur = list[wfIndex];
    if (cur?.gate || cur?.loop) {
      setPaused(true); // 승인 대기
      return;
    }
    const next = wfIndex + 1;
    if (next < list.length) {
      setWfIndex(next);
      sendStep(list, next);
    } else {
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.last_stop_at, session.last_event_at, session.status, running, paused]);

  const btn =
    "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";
  const curStep = running ? runStepsRef.current[wfIndex] : undefined;

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setPanel(panel === "goal" ? null : "goal")} className={btn}>
          🎯 목표 {goal.trim() ? "•" : ""}
        </button>
        <button onClick={() => setPanel(panel === "wf" ? null : "wf")} className={btn}>
          🔁 워크플로우 {liveSteps.length ? `(${liveSteps.length})` : ""}
        </button>
        {running && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            ▶ {wfIndex + 1}/{runStepsRef.current.length}
            {paused ? " · 승인 대기" : " 실행 중"}
          </span>
        )}
      </div>

      {/* 승인 대기 바 (게이트/루프) — 패널 안 열어도 보이게 */}
      {running && paused && curStep && (
        <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="mb-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
            {curStep.loop ? "🔁 슬라이스 완료 — 다음은?" : "✋ 게이트 — 검토 후 승인하면 다음 단계로"}
            {curStep.label ? ` (${curStep.label})` : ""}
          </p>
          {session.status === "waiting" ? (
            // 에이전트가 질문 대기 중 → 미완성 승인 방지. 먼저 위 질문에 답하게 안내.
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              ⤴ 먼저 위 질문에 답하세요. (답하면 ✅ 승인 버튼이 나타나요)
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {curStep.loop && (
                <button
                  onClick={repeatStep}
                  className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  🔁 다음 슬라이스
                </button>
              )}
              <button
                onClick={approveNext}
                className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
              >
                ✅ {curStep.loop ? "다음 단계로" : "승인 · 다음"}
              </button>
              <button
                onClick={stopWorkflow}
                className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                ⏹ 중단
              </button>
            </div>
          )}
        </div>
      )}

      {/* 골 패널 */}
      {panel === "goal" && (
        <div className="mt-1.5 rounded border border-zinc-200 p-2 dark:border-zinc-700">
          <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-500">이 세션의 목표</p>
          <textarea
            value={goal}
            onChange={(e) => saveGoal(e.target.value)}
            placeholder="예: PillDaily MVP 출시 — 식단표 생성기 + 결제까지"
            rows={2}
            className="w-full resize-y rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={injectGoal}
              disabled={!goal.trim()}
              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              목표 주입 (세션에 보내기)
            </button>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">자동 저장됨</span>
          </div>
        </div>
      )}

      {/* 워크플로우 패널 */}
      {panel === "wf" && (
        <div className="mt-1.5 rounded border border-zinc-200 p-2 dark:border-zinc-700">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              단계 순서대로 실행 · ✋게이트는 승인 대기 · 🔁루프는 슬라이스 반복
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadTemplate(UNKNOWNS_PIPELINE)}
                className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
              >
                Unknowns 발견 흐름
              </button>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <button
                onClick={() => loadTemplate(BUILD_PIPELINE)}
                className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                표준 파이프라인
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span
                  className={`mt-1.5 w-4 shrink-0 text-center text-xs ${
                    running && i === wfIndex
                      ? "font-bold text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-400"
                  }`}
                >
                  {s.gate ? "✋" : s.loop ? "🔁" : i + 1}
                </span>
                <textarea
                  value={s.text}
                  onChange={(e) =>
                    saveSteps(steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                  }
                  placeholder={i === 0 ? "예: 계획을 단계별로 세워줘" : "다음 단계…"}
                  rows={s.text.length > 60 ? 2 : 1}
                  className="min-w-0 flex-1 resize-y rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  onClick={() =>
                    saveSteps(steps.map((x, j) => (j === i ? { ...x, gate: !x.gate } : x)))
                  }
                  title="게이트(승인 대기) 토글"
                  className={`mt-0.5 shrink-0 text-xs ${s.gate ? "text-amber-500" : "text-zinc-300 hover:text-amber-400 dark:text-zinc-600"}`}
                >
                  ✋
                </button>
                <button
                  onClick={() => {
                    const f = steps.filter((_, j) => j !== i);
                    saveSteps(f.length ? f : [{ text: "" }]);
                  }}
                  className="mt-0.5 shrink-0 text-xs text-zinc-400 hover:text-red-500"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={() => saveSteps([...steps, { text: "" }])}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              + 단계 추가
            </button>
            {running ? (
              <button
                onClick={stopWorkflow}
                className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                ⏹ 중단
              </button>
            ) : (
              <button
                onClick={runWorkflow}
                disabled={!liveSteps.length}
                className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                ▶ 실행 ({liveSteps.length}단계)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
