"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionRow, StepRow } from "@/lib/db";
import { STATUS_META, relativeTime } from "@/lib/ui";
import { Markdown } from "@/components/Markdown";
import { StatusDot } from "@/components/StatusDot";
import { pendingSentMessages, isTransientError } from "@/lib/sessionView";
import { useImageUpload } from "@/lib/useImageUpload";
import { SessionWorkflow } from "@/components/SessionWorkflow";
import { USERTEST_PRD } from "@/lib/userTestPrd";
import { UI_GUIDE_PROMPT } from "@/lib/uiGuidePrompt";
import { PRD_PROMPT } from "@/lib/prdPrompt";

// 이 길이 이상 붙여넣으면 입력칸에 넣지 않고 .txt 파일로 첨부 (느려짐·잘림 방지)
const PASTE_FILE_THRESHOLD = 1500;

// 각 퀵액션 버튼 hover 시 보여줄 프롬프트 미리보기. 아래 함수들이 실제 주입하는 문구와 동일하게 유지할 것.
const HINT = {
  continue: "계속 진행해줘.",
  proceedAll:
    "이대로 전부 알아서 진행해줘. 막히거나 꼭 확인이 필요할 때만 물어보고, 나머지는 끝까지 진행해.",
  esc: "진행 중인 작업을 중단합니다 (Esc 키 주입).",
  approve: "권한/확인 프롬프트에 Yes(1)를 선택하고 엔터로 확정합니다.",
  commit: "지금까지 작업을 적절한 커밋 메시지로 커밋하고 푸시해서 배포해줘.",
  clear: "/clear — 대화 컨텍스트를 초기화합니다.",
  compact: "/compact — 대화를 요약 압축합니다.",
  solution:
    "지금 이 문제/상황을 해결하려면 어떻게 하는 게 좋을지 제안해줘 — 가능한 방안 2~3개를 장단점과 함께 제시하고, 추천안도 표시해. (구현 전 제안만, 더 깊이 조사가 필요하면 조사부터)",
  recommend: "지금 상황에서 다음에 할 만한 작업을 추천해줘. 선택지(옵션)로 제시해줘.",
  check: "테스트랑 빌드를 돌려서 통과하는지 확인하고 결과를 알려줘.",
  status: "지금까지 한 작업과 현재 상태, 다음 할 일을 간단히 요약해줘.",
  progress: "지금 어디까지 진행됐고 현재 무엇을 하고 있는지 알려줘.",
  design:
    "frontend-design 스킬로 디자인 방향(미감·타이포·컬러·무드)부터 정하고, AIDesigner(MCP/스킬)로 목업·시안을 만든 뒤, Playwright MCP로 스크린샷을 찍어 보여줘.",
  deploy:
    "이 프로젝트를 Neon(Postgres) + Google Cloud Run에 배포해줘. `/deploy-neon-cloudrun` 스킬을 사용해서 진행해 — 컨테이너화, Neon DB 연결(DATABASE_URL), Cloud Run 배포, scale-to-zero까지. 필요한 정보(프로젝트 ID·리전 등)는 나에게 물어봐.",
  safari: "지금 만들고 있는 프로젝트(목업/미리보기)를 사파리 창으로 띄워서 보여줘.",
  prd: PRD_PROMPT,
  uiGuide: UI_GUIDE_PROMPT,
  userTest: USERTEST_PRD,
  // Fable "unknowns 발견" 기법들
  interview:
    "지금 작업/상황에 대해 모호하거나 결정이 필요한 부분을 한 번에 하나씩 질문해줘(AskUserQuestion 사용). 특히 내 답이 아키텍처나 방향을 바꿀 수 있는 질문을 우선해. 내가 답하면 반영해서 다음 질문으로 이어가.",
  blindspot:
    "지금 이 작업에 대해 내가 놓치고 있는 'unknown unknowns(모르는 줄도 모르는 것)'를 blindspot pass로 찾아서 쉽게 설명해줘 — 무엇을 물어봐야 하는지, 좋은 결과가 어떤 건지, 과거 관련 작업이나 피해야 할 함정까지. 필요하면 코드베이스와 웹을 조사해서, 내가 더 잘 프롬프트할 수 있게 도와줘.",
  implNotes:
    "지금부터 implementation-notes.md 파일을 유지하면서 진행해줘. 계획을 벗어나게 만드는 엣지케이스를 만나면 보수적인 선택을 하고 'Deviations' 섹션에 기록한 뒤 계속 진행해. 나중에 다음 시도에서 배울 수 있게.",
  quiz:
    "방금까지의 변경을 내가 완전히 이해할 수 있게, 맥락·직관·무엇을 왜 했는지 담은 리포트를 만들어줘(가능하면 HTML). 맨 아래에는 이 변경에 대해 내가 반드시 통과해야 하는 퀴즈를 붙여줘.",
} as const;

// 진행 단계가 없을 때만 쓰는 폴백 한 줄
function fallbackLine(s: SessionRow): string {
  if (s.just_did) return s.just_did;
  if (s.last_activity) return s.last_activity;
  return s.last_event ?? "—";
}

// 세션 한 행. 헤더는 상태/시각만(요약 중복 제거), 본문에 최근 진행 3개. 펼치면 전체.
export function SessionAccordion({
  session,
  now,
  onOpenDetail,
  upload,
}: {
  session: SessionRow;
  now: number;
  onOpenDetail: () => void;
  upload?: ReturnType<typeof useImageUpload>; // 페이지 전역 드롭과 공유(없으면 내부 상태)
}) {
  const sm = STATUS_META[session.status];
  const recent = session.recentSteps ?? [];
  const [open, setOpen] = useState(false);
  const [allSteps, setAllSteps] = useState<StepRow[] | null>(null);
  const canExpand = recent.length >= 2; // 2개 꽉 차면 이전 기록이 더 있을 수 있음
  const shown = open && allSteps ? allSteps : recent;
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [recapOpen, setRecapOpen] = useState(false); // 리캡 기본 접힘 (공간 절약)
  // 보낸 요청 중 아직 응답 안 온 것만 (턴 완료=새 진행단계가 생기면 사라짐)
  const pendingSent = pendingSentMessages(session);

  function toggleStep(id: number) {
    setExpandedSteps((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // 세션 선택 시 하단 입력칸에 자동 포커스 (바로 타이핑) + 임시저장(draft) 복원
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setSendText(localStorage.getItem(`flow-draft-${session.session_id}`) || "");
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.session_id]);
  // 입력 중 텍스트를 세션별로 임시저장 (저장은 debounce — 긴 텍스트 타이핑 렉 방지)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setDraft(v: string) {
    setSendText(v); // state는 즉시(입력 반응성)
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const key = `flow-draft-${session.session_id}`;
    if (!v) {
      localStorage.removeItem(key); // 비우면 즉시 제거 (전환 시 되살아남 방지)
      return;
    }
    draftTimer.current = setTimeout(() => localStorage.setItem(key, v), 400);
  }

  // 스크롤 to-bottom: "맨 아래 근처에 붙어있을 때만" 자동으로 따라간다(stick-to-bottom).
  // 사용자가 위로 올려서 과거 내용을 보는 중이면 자동 스크롤을 멈춘다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true); // 지금 맨 아래에 붙어있나
  const toBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // 맨 아래에서 80px 이내면 "붙어있음"으로 간주
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  // 세션 전환: 항상 맨 아래로 + 붙임 재활성화
  useEffect(() => {
    stickBottomRef.current = true;
    toBottom();
    const t = setTimeout(toBottom, 60); // 마크다운 렌더 후 한 번 더
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.session_id]);
  // 새 답변/활동: 붙어있을 때만 따라감(위로 올려 보는 중이면 방해 안 함)
  useEffect(() => {
    if (!stickBottomRef.current) return;
    toBottom();
    const t = setTimeout(() => {
      if (stickBottomRef.current) toBottom();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.last_event_at]);

  // SSE 갱신 시 잠깐 플래시 (지금 진행 중임을 표시)
  const [flash, setFlash] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlash(true);
    setSent(null); // 세션이 응답하면 토스트 제거
    setSelectedOpts(new Set());
    setQSel({});
    const t = setTimeout(() => setFlash(false), 1000);
    return () => clearTimeout(t);
  }, [session.last_event_at]);

  // 다음 작업 옵션 + 명령 전송 (tmux 양방향 제어)
  const [sendText, setSendText] = useState("");
  const [sent, setSent] = useState<string | null>(null); // 방금 전송한 내용 (피드백)
  const [sendErr, setSendErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // 페이지에서 내려준 공유 업로드가 있으면 그걸 쓰고, 없으면 내부 훅 사용
  const internalUpload = useImageUpload();
  const { attachments, setAttachments, uploading, uploadFiles } = upload ?? internalUpload;
  const [selectedOpts, setSelectedOpts] = useState<Set<number>>(new Set());
  const [qSel, setQSel] = useState<Record<number, number>>({}); // 다중 질문: 질문idx→옵션idx
  const [qFree, setQFree] = useState<Record<number, string>>({}); // 질문idx→자유 텍스트 답변
  const [hint, setHint] = useState<string | null>(null); // 버튼 hover 시 주입될 프롬프트 미리보기
  let nextOpts: string[] = [];
  try {
    nextOpts = JSON.parse(session.next_options || "[]");
  } catch {}
  // 원본 그대로: 다중 질문 전부. 각 질문 = 헤더 + 질문 + 옵션(라벨/설명). (구버전 호환)
  type PQ = { question: string; header: string; options: { label: string; description: string }[] };
  let pendingQs: PQ[] = [];
  try {
    const raw = session.pending_question ? JSON.parse(session.pending_question) : null;
    if (raw) {
      const norm = (q: { question?: string; header?: string; options?: unknown[] }): PQ => ({
        question: q.question ?? "",
        header: q.header ?? "",
        options: (q.options ?? []).map((o: unknown) =>
          typeof o === "string"
            ? { label: o, description: "" }
            : (o as { label: string; description: string }),
        ),
      });
      pendingQs = Array.isArray(raw.questions) && raw.questions.length
        ? raw.questions.map(norm)
        : [norm(raw)];
    }
  } catch {}
  const isMulti = pendingQs.length >= 2;
  const pendingQ = pendingQs[0] ?? null; // 단일 질문 호환

  // 전송: 즉시 "전송됨"으로 컨트롤 대체. 세션이 응답(SSE)하면 컨트롤 복귀.
  function fire(text: string, enter: boolean, label: string, reqDisplay?: string) {
    setSent(label);
    setSendErr("");
    fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id, text, enter, display: reqDisplay ?? text }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(`에러: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("전송 실패");
      });
    setTimeout(() => setSent(null), 6000); // 폴백: SSE 안 와도 복귀
  }
  function sendSelect(num: number) {
    const opt = pendingQ?.options[num - 1];
    fire(String(num), false, `선택 ${num}`, opt ? `${num}. ${opt.label}` : `선택 ${num}`);
  }
  // 해결책 제안받기: 지금 문제/상황의 해결 방안을 여러 개 제안받음
  function proposeSolution() {
    fire(
      "지금 이 문제/상황을 해결하려면 어떻게 하는 게 좋을지 제안해줘 — 가능한 방안 2~3개를 장단점과 함께 제시하고, 추천안도 표시해. (구현 전 제안만, 더 깊이 조사가 필요하면 조사부터)",
      true,
      "해결책 제안",
      "💡 해결책 제안",
    );
  }
  // 다음 작업 추천받기: 세션에 추천 요청을 보냄(응답은 다음 옵션 버튼으로 뜸)
  function recommendNext() {
    fire(
      "지금 상황에서 다음에 할 만한 작업을 추천해줘. 선택지(옵션)로 제시해줘.",
      true,
      "다음 작업 추천",
      "🧭 다음 작업 추천받기",
    );
  }
  // 테스트/빌드 점검
  function runCheck() {
    fire(
      "테스트랑 빌드를 돌려서 통과하는지 확인하고 결과를 알려줘.",
      true,
      "테스트/빌드 점검",
      "🧪 테스트/빌드 점검",
    );
  }
  function continueWork() {
    fire("계속 진행해줘.", true, "계속", "▶️ 계속 진행");
  }
  function proceedAll() {
    fire(
      "이대로 전부 알아서 진행해줘. 막히거나 꼭 확인이 필요할 때만 물어보고, 나머지는 끝까지 진행해.",
      true,
      "전부 진행",
      "⏩ 전부 진행",
    );
  }
  function sendEsc() {
    setSent("중단");
    setSendErr("");
    fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id, escKey: true, display: "⏹️ 중단(Esc)" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(`에러: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("전송 실패");
      });
    setTimeout(() => setSent(null), 6000);
  }
  function approve() {
    fire("1", true, "승인", "✅ 승인"); // 권한 프롬프트 'Yes'(1) 선택 + 엔터로 확정
  }
  function commitWork() {
    fire(
      "지금까지 작업을 적절한 커밋 메시지로 커밋하고 푸시해서 배포해줘.",
      true,
      "배포",
      "🚢 배포(커밋·푸시)",
    );
  }
  function clearContext() {
    fire("/clear", true, "클리어", "🧹 /clear"); // 대화 컨텍스트 초기화
  }
  function compactContext() {
    fire("/compact", true, "컴팩트", "🗜️ /compact"); // 대화 요약 압축
  }
  // 모델 변경: /model <별칭> 실행 후, 전환 확인 프롬프트(Yes/No)를 엔터로 자동 확정
  function changeModel(m: string) {
    if (!m) return;
    setSent(`모델→${m}`);
    setSendErr("");
    fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id, modelSwitch: m, display: `🤖 모델→${m}` }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(`에러: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("전송 실패");
      });
    setTimeout(() => setSent(null), 6000);
  }
  function statusSummary() {
    fire(
      "지금까지 한 작업과 현재 상태, 다음 할 일을 간단히 요약해줘.",
      true,
      "현황 요약",
      "📊 현황 요약",
    );
  }
  // 디자인 시스템/UI 가이드 작성 (UI_GUIDE.md 생성 + 참고 규칙)
  function uiGuide() {
    fire(UI_GUIDE_PROMPT, true, "디자인시스템", "🧩 디자인 시스템/UI 가이드");
  }
  // 디자인/목업: frontend-design 스킬 + AIDesigner + Playwright로 시안 만들고 스크린샷
  function designMockup() {
    fire(
      "frontend-design 스킬로 디자인 방향(미감·타이포·컬러·무드)부터 정하고, AIDesigner(MCP/스킬)로 목업·시안을 만든 뒤, Playwright MCP로 스크린샷을 찍어 보여줘.",
      true,
      "디자인/목업",
      "🎨 디자인/목업",
    );
  }
  // 전체 사이트 유저테스트 (PRD v2 주입)
  function userTest() {
    fire(USERTEST_PRD, true, "유저테스트", "🕵️ 전체 사이트 유저테스트");
  }
  // Neon(Postgres) + Google Cloud Run 배포
  function deployNeonCloudRun() {
    fire(
      "이 프로젝트를 Neon(Postgres) + Google Cloud Run에 배포해줘. `/deploy-neon-cloudrun` 스킬을 사용해서 진행해 — 컨테이너화, Neon DB 연결(DATABASE_URL), Cloud Run 배포, scale-to-zero까지. 필요한 정보(프로젝트 ID·리전 등)는 나에게 물어봐.",
      true,
      "Neon+CloudRun 배포",
      "🚀 배포(Neon+CloudRun)",
    );
  }
  // Fable "unknowns 발견" 기법들
  function interview() {
    fire(HINT.interview, true, "인터뷰", "🎤 인터뷰(질문받기)");
  }
  function blindspot() {
    fire(HINT.blindspot, true, "블라인드스팟", "🔍 블라인드스팟 패스");
  }
  function implNotes() {
    fire(HINT.implNotes, true, "구현노트", "📝 구현노트 유지");
  }
  function quiz() {
    fire(HINT.quiz, true, "퀴즈", "🧠 변경 퀴즈");
  }
  // 깊이 있는 PRD 작성
  function makePrd() {
    fire(PRD_PROMPT, true, "PRD", "📋 PRD 작성");
  }
  // 현재 진행상황 물어보기
  function progressStatus() {
    fire(
      "지금 어디까지 진행됐고 현재 무엇을 하고 있는지 알려줘.",
      true,
      "진행상황",
      "📍 진행상황",
    );
  }
  // 죽은(💀) 세션 되살리기: 새 iTerm 탭에서 claude --resume
  function reviveSession() {
    setSent("되살리기");
    setSendErr("");
    fetch("/api/revive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(`에러: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("되살리기 실패");
      });
    setTimeout(() => setSent(null), 6000);
  }
  // 세션 완전 삭제 (목록에서 제거). 대화 원본은 ~/.claude에 남음.
  function removeSession() {
    if (
      !confirm(
        "이 세션을 목록에서 완전히 삭제할까요?\n(되돌릴 수 없어요 — 단, 대화 기록 원본은 ~/.claude에 그대로 남습니다)",
      )
    )
      return;
    fetch(`/api/sessions/${session.session_id}`, { method: "DELETE" }).catch(() => {});
  }
  // 재접속: 같은 탭에서 claude를 /exit로 종료 후 claude --resume으로 다시 접속 (스킬/설정 재로드)
  function reconnectSession() {
    if (
      !confirm(
        "이 세션을 재접속할까요?\n(claude를 종료 후 --resume으로 다시 들어갑니다 — 스킬/설정 재로드)",
      )
    )
      return;
    setSent("재접속 중…");
    setSendErr("");
    fetch("/api/reconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(`재접속 실패: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("재접속 실패");
      });
    setTimeout(() => setSent(null), 8000);
  }
  // 사파리 창 띄우기: 세션에게 "지금 만든 프로젝트(목업/미리보기)를 사파리로 띄워줘" 요청
  function focusSafari() {
    fire(
      "지금 만들고 있는 프로젝트(목업/미리보기)를 사파리 창으로 띄워서 보여줘.",
      true,
      "사파리 창",
      "🪟 사파리 창 띄우기",
    );
  }
  // iTerm 탭으로 이동: 이미 열려있는 세션 탭을 창 더미에서 찾아 화면 앞으로 가져온다
  function revealTab() {
    setSent("탭 이동");
    setSendErr("");
    fetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(d.notfound ? "탭이 닫혀있음 — '세션 복구'로 다시 띄우세요" : `에러: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("이동 실패");
      });
    setTimeout(() => setSent(null), 4000);
  }
  // 질문별 답변 완료 여부: 옵션 선택했거나 자유 텍스트를 입력했으면 완료
  const qDone = (i: number) => (qFree[i]?.trim()?.length ?? 0) > 0 || qSel[i] != null;
  const allAnswered = isMulti && pendingQs.every((_, i) => qDone(i));
  const anyFree = pendingQs.some((_, i) => (qFree[i]?.trim()?.length ?? 0) > 0);

  // AskUserQuestion 위젯을 Esc로 닫고 자유 텍스트 답변을 전송 (선택지에 원하는 답이 없을 때)
  function fireEscText(text: string, display: string, label: string) {
    setSent(label);
    setSendErr("");
    fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id, escThenText: true, text, display }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(`에러: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("전송 실패");
      });
    setTimeout(() => setSent(null), 6000);
  }

  // 단일 질문 자유 답변 전송
  function sendFreeSingle() {
    const free = (qFree[0] ?? "").trim();
    if (!free) return;
    setQFree({});
    fireEscText(free, `✏️ ${free}`, "자유 답변");
  }

  // 다중 질문 제출: 자유 입력이 하나라도 있으면 Esc→자연어 일괄, 전부 옵션이면 숫자 시퀀스
  function submitAnswers() {
    if (!allAnswered) return;
    if (anyFree) {
      // 각 질문의 답(자유 텍스트 우선, 없으면 선택한 옵션 라벨)을 자연어로 묶어 전송
      const answer = (i: number) => {
        const f = (qFree[i] ?? "").trim();
        return f || pendingQs[i].options[qSel[i]]?.label || "";
      };
      const msg =
        "아래 질문들에 대한 내 답변이야:\n" +
        pendingQs.map((q, i) => `${i + 1}) ${q.header || q.question}: ${answer(i)}`).join("\n");
      const display = pendingQs
        .map((q, i) => `${q.header || `Q${i + 1}`}: ${answer(i)}`)
        .join(" / ");
      setQSel({});
      setQFree({});
      fireEscText(msg, display, `${pendingQs.length}개 답변(자유)`);
      return;
    }
    submitMulti();
  }

  function submitMulti() {
    const seq = pendingQs.map((_, i) => String((qSel[i] ?? 0) + 1));
    const display = pendingQs
      .map((q, i) => `${q.header || `Q${i + 1}`}: ${q.options[qSel[i]]?.label ?? ""}`)
      .join(" / ");
    setSent(`${pendingQs.length}개 답변`);
    setQSel({});
    setSendErr("");
    fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.session_id, sequence: seq, display }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setSent(null);
          setSendErr(`에러: ${d.error}`);
        }
      })
      .catch(() => {
        setSent(null);
        setSendErr("전송 실패");
      });
    setTimeout(() => setSent(null), 6000);
  }
  function send(text: string) {
    // 보내기 한 번으로: 선택한 옵션 + 첨부 이미지 + 입력 텍스트를 함께 전송.
    const trimmed = text.trim();
    const opts = [...selectedOpts].sort((a, b) => a - b).map((i) => nextOpts[i]);
    const paths = attachments.map((a) => a.path).join(" ");
    const full = [paths, opts.join(", "), trimmed].filter(Boolean).join(" ");
    if (!full) return;
    const imgTag = attachments.length ? `📎${attachments.length} ` : "";
    const display = imgTag + [opts.join(", "), trimmed].filter(Boolean).join(" / ") || imgTag + "(첨부)";
    const toast = (imgTag + [opts.join(", "), trimmed].filter(Boolean).join(" ")).slice(0, 30) || "전송";
    setSendText("");
    // 예약된 draft 저장 타이머를 취소해야 방금 지운 임시저장이 되살아나지 않음
    if (draftTimer.current) clearTimeout(draftTimer.current);
    localStorage.removeItem(`flow-draft-${session.session_id}`); // 전송했으니 임시저장 비움
    setAttachments([]);
    setSelectedOpts(new Set());
    // 죽은(💀) 세션(dead 또는 ended)이면: 되살리면서 이 메시지를 기동 후 자동 전송하도록 예약
    if (session.dead || session.status === "ended") {
      setSent("되살리는 중… 곧 전송");
      setSendErr("");
      fetch("/api/revive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id, text: full }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d.ok) {
            setSent(null);
            setSendErr(`되살리기 실패: ${d.error}`);
          }
        })
        .catch(() => {
          setSent(null);
          setSendErr("되살리기 실패");
        });
      setTimeout(() => setSent(null), 12000);
      return;
    }
    fire(full, true, toast, display);
  }
  function toggleOpt(i: number) {
    setSelectedOpts((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  function toggleFull() {
    const next = !open;
    setOpen(next);
    if (next && allSteps === null) {
      fetch(`/api/sessions/${session.session_id}`)
        .then((r) => r.json())
        .then((d) => setAllSteps(d.steps ?? []))
        .catch(() => setAllSteps([]));
    }
  }

  return (
    <div
      style={{ height: "100%" }}
      className={`flex flex-col overflow-hidden rounded-md border border-l-4 border-zinc-200 ${sm.bar} bg-white dark:border-zinc-700 dark:bg-zinc-900 ${
        flash ? "flow-flash" : ""
      }`}
    >
      {/* 위쪽(내용)만 스크롤 — 입력/버튼은 하단 고정. 선택/새답변 시 맨 아래로. */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      {/* 죽은(💀) 세션 바 — 되살리기 / 완전 삭제 (dead=1 또는 ended) */}
      {session.dead || session.status === "ended" ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            💀 죽은 세션 — 프로세스 종료됨 (기록은 보존)
          </span>
          <button
            onClick={reviveSession}
            className="ml-auto rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
          >
            ↻ 되살리기
          </button>
          <button
            onClick={removeSession}
            className="rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            🗑 완전 삭제
          </button>
        </div>
      ) : null}
      {/* 헤더: 상태 (시각) — 왼쪽에 묶어서. 요약은 아래 진행 최신과 중복이라 제거 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        {session.session_alias && (
          <span className="shrink-0 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {session.session_alias}
          </span>
        )}
        <StatusDot session={session} now={now} className="h-2 w-2" />
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{sm.label}</span>
        <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
          ({relativeTime(session.last_event_at, now)})
        </span>
        {session.stage && (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {session.stage}
          </span>
        )}
        <button
          onClick={reconnectSession}
          title="재접속 (나갔다 다시: /exit → claude --resume) — 스킬/설정 새로 로드할 때"
          className="ml-auto shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-600 dark:text-zinc-400 dark:hover:text-emerald-400"
        >
          ↻ 재접속
        </button>
        <button
          onClick={onOpenDetail}
          className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
        >
          상세 · 별명 ↗
        </button>
      </div>

      {/* 에러 배너: 사유 표시 + 일시오류면 자동 재시도 안내 */}
      {session.status === "error" && (
        <div
          className={`border-t px-4 py-2 ${
            isTransientError(session.error_reason)
              ? "border-amber-200 bg-amber-50 dark:border-zinc-800 dark:bg-amber-500/10"
              : "border-red-200 bg-red-50 dark:border-zinc-800 dark:bg-red-500/10"
          }`}
        >
          <p
            className={`text-xs font-medium ${
              isTransientError(session.error_reason)
                ? "text-amber-700 dark:text-amber-300"
                : "text-red-700 dark:text-red-300"
            }`}
          >
            {isTransientError(session.error_reason)
              ? "⏳ 일시 오류 — 자동 재시도 중 (5초 간격)"
              : "⚠️ 턴 실패"}
          </p>
          {session.error_reason && (
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
              {session.error_reason}
            </p>
          )}
        </div>
      )}

      {/* 리캡 (세션 총정리, away_summary) — 기본 1줄 접힘, 클릭 시 펼침. 차분한 회색. */}
      {session.recap && (
        <div className="border-t border-zinc-100 px-4 py-1.5 dark:border-zinc-800">
          <button
            onClick={() => setRecapOpen((v) => !v)}
            className="flex w-full items-start gap-1 text-left text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <span className="shrink-0">📋 {recapOpen ? "리캡 ▴" : "리캡"}</span>
            {!recapOpen && (
              <span className="min-w-0 flex-1 truncate text-zinc-400 dark:text-zinc-500">
                {session.recap}
              </span>
            )}
          </button>
          {recapOpen && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300">
              {session.recap}
            </p>
          )}
        </div>
      )}

      {/* 내가 보낸 요청 — 응답 대기중인 것만. 응답이 오면 자동으로 사라짐. */}
      {pendingSent.length > 0 && (
        <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-2 dark:border-zinc-800 dark:bg-amber-500/5">
          <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            📤 보낸 요청 · 응답 대기중
          </p>
          {pendingSent.map((m) => (
            <div key={m.id} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 flow-working" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-800 dark:text-zinc-100">{m.text}</p>
                <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                  {relativeTime(m.created_at, now)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 본문: 진행 단계(최근 2개, 펼치면 전체) — 없으면 폴백 한 줄 */}
      {shown.length > 0 ? (
        <div className="relative border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
          {/* 전체 히스토리 토글 — 진행 영역 우측 상단 빈칸 */}
          {canExpand && (
            <button
              onClick={toggleFull}
              style={{ position: "absolute", right: 12, top: 8, zIndex: 10 }}
              className="text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
            >
              {open ? "접기 ▴" : "전체 ▾"}
            </button>
          )}
          {/* 최신이 맨 위 + 볼드, 이전은 아래에 흐리게. 클릭 시 전체 질문/답변 펼침 */}
          {[...shown].reverse().map((st, i) => {
            const isLatest = i === 0;
            const isOpen = expandedSteps.has(st.id);
            const hasFull = !!(st.full_request || st.full_answer);
            return (
              <div key={st.id} className={i > 0 ? "mt-2.5" : ""}>
                {/* 헤더: 점 + 요청/결과 */}
                <div className="flex gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      isLatest ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => hasFull && toggleStep(st.id)}
                    className={`min-w-0 flex-1 pr-12 text-left ${
                      hasFull ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    {st.request && (
                      <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                        <span className="text-zinc-300 dark:text-zinc-600">요청 </span>
                        {st.request}
                      </p>
                    )}
                    <p
                      className={
                        isLatest
                          ? "text-sm font-semibold text-zinc-900 dark:text-white"
                          : "text-sm text-zinc-500 dark:text-zinc-400"
                      }
                    >
                      {hasFull && (
                        <span className="mr-1 text-zinc-400 dark:text-zinc-500">
                          {isOpen ? "▾" : "▸"}
                        </span>
                      )}
                      {st.text}
                    </p>
                  </button>
                </div>

                {/* 최신 답변: 항상 전체 펼침(클립·클릭 없음). 질문은 선택 토글. */}
                {isLatest && st.full_answer && (
                  <div
                    style={{ backgroundColor: "#0a0a0a", borderColor: "#3f3f46" }}
                    className="mt-1.5 rounded-md border px-3 py-2"
                  >
                    {isOpen && st.full_request && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-emerald-400">🧑 나</p>
                        <Markdown terminal>{st.full_request}</Markdown>
                        <p className="mt-2 text-xs font-medium text-zinc-400">🤖 Claude</p>
                      </div>
                    )}
                    <Markdown terminal>{st.full_answer}</Markdown>
                    {st.full_request && (
                      <button
                        type="button"
                        onClick={() => toggleStep(st.id)}
                        className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        {isOpen ? "질문 숨기기 ▴" : "🧑 내 질문 보기 ▾"}
                      </button>
                    )}
                  </div>
                )}

                {/* 펼침: 질문 + 답변 (비최신 step만 — 최신은 위에서 항상 표시) */}
                {isOpen && !isLatest && (
                  <div
                    style={{ backgroundColor: "#0a0a0a", borderColor: "#3f3f46" }}
                    className="mt-1.5 space-y-2 rounded-md border p-3"
                  >
                    {st.full_request && (
                      <div>
                        <p className="text-xs font-medium text-emerald-400">🧑 나</p>
                        <Markdown terminal>{st.full_request}</Markdown>
                      </div>
                    )}
                    {st.full_answer && (
                      <div>
                        <p className="text-xs font-medium text-zinc-400">🤖 Claude</p>
                        <Markdown terminal>{st.full_answer}</Markdown>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleStep(st.id)}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      접기 ▴
                    </button>
                  </div>
                )}

                <p className="ml-4 mt-0.5 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                  {relativeTime(st.created_at, now)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
          <p className="truncate text-sm text-zinc-600 dark:text-zinc-300">{fallbackLine(session)}</p>
        </div>
      )}
      </div>
      {/* ↑ 스크롤 영역 끝. 아래는 하단 고정 컨트롤 */}

      {/* 다음옵션/질문 버튼 + 명령 전송 — 하단 고정 */}
      {(session.iterm_id ||
        session.tty ||
        nextOpts.length > 0 ||
        (pendingQ && pendingQ.options.length > 0)) && (
        <div
          className="shrink-0 border-t border-zinc-100 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
          onMouseOver={(e) => {
            const el = (e.target as HTMLElement).closest("[data-hint]");
            setHint(el ? el.getAttribute("data-hint") : null);
          }}
          onMouseLeave={() => setHint(null)}
        >
          {/* 버튼 hover 미리보기: 그 버튼이 주입할 프롬프트 전문 */}
          {hint && (
            <div className="mb-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <span className="font-semibold text-zinc-500 dark:text-zinc-400">입력될 프롬프트 ▸ </span>
              {hint}
            </div>
          )}
          {/* 방금 전송 확인(휘발성) — 영구 기록은 위 "내가 보낸 요청" 블록 */}
          {sent && (
            <p className="mb-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              ✓ 방금 전송됨: {sent}
            </p>
          )}
          {/* AskUserQuestion 선택지 — 단일이면 즉시 선택, 다중이면 질문별 선택 후 한 번에 제출 */}
          {pendingQs.length > 0 && pendingQs[0].options.length > 0 && (
            <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-500/40 dark:bg-amber-500/10">
              {isMulti && (
                <p className="mb-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                  ❓ 질문 {pendingQs.length}개 — 각각 고르고 전송
                </p>
              )}
              {pendingQs.map((q, qi) => (
                <div key={qi} className={qi > 0 ? "mt-2.5 border-t border-amber-200 pt-2 dark:border-amber-500/30" : ""}>
                  {q.header && (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300/80">
                      {q.header}
                    </p>
                  )}
                  <p className="mb-1.5 text-sm font-medium text-amber-900 dark:text-amber-100">
                    ❓ {q.question || "선택 대기 중"}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {q.options.map((o, i) => {
                      const hasFree = (qFree[qi]?.trim()?.length ?? 0) > 0;
                      const picked = isMulti && qSel[qi] === i && !hasFree;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            // 옵션 선택 시 그 질문의 자유 입력은 비운다
                            setQFree((p) => ({ ...p, [qi]: "" }));
                            if (isMulti) setQSel((p) => ({ ...p, [qi]: i }));
                            else sendSelect(i + 1);
                          }}
                          className={`rounded border px-2.5 py-1.5 text-left ${
                            picked
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15"
                              : "border-amber-400 bg-white hover:bg-amber-100 dark:bg-zinc-900 dark:hover:bg-amber-500/20"
                          }`}
                        >
                          <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                            {picked ? "✓ " : `${i + 1}. `}
                            {o.label}
                          </span>
                          {o.description && (
                            <span className="mt-0.5 block whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300">
                              {o.description}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* 직접 입력: 선택지에 원하는 답이 없을 때 자유 텍스트로 답변 */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={qFree[qi] ?? ""}
                      placeholder="✏️ 원하는 답이 없으면 직접 입력…"
                      onChange={(e) => {
                        const v = e.target.value;
                        setQFree((p) => ({ ...p, [qi]: v }));
                        // 자유 입력 시 그 질문의 옵션 선택은 해제
                        if (v.trim())
                          setQSel((p) => {
                            const n = { ...p };
                            delete n[qi];
                            return n;
                          });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isMulti && (qFree[0]?.trim()?.length ?? 0) > 0) {
                          e.preventDefault();
                          sendFreeSingle();
                        }
                      }}
                      className="flex-1 rounded border border-amber-300 bg-white px-2 py-1 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-amber-500/40 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    {!isMulti && (qFree[0]?.trim()?.length ?? 0) > 0 && (
                      <button
                        onClick={sendFreeSingle}
                        className="shrink-0 rounded bg-emerald-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-emerald-500"
                      >
                        전송
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isMulti && (
                <button
                  onClick={submitAnswers}
                  disabled={!allAnswered}
                  className="mt-2.5 w-full rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  {allAnswered
                    ? anyFree
                      ? "전송 (자유 답변 포함)"
                      : "전송 (모든 질문 답변 완료)"
                    : `전송 (${pendingQs.filter((_, i) => qDone(i)).length}/${pendingQs.length} 답변)`}
                </button>
              )}
            </div>
          )}
          {nextOpts.length > 0 && (
            <div className="mb-2">
              <div className="flex flex-wrap gap-1.5">
                {nextOpts.map((o, i) => {
                  const on = selectedOpts.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleOpt(i)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        on
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                          : "border-zinc-300 text-zinc-700 hover:border-emerald-400 dark:border-zinc-600 dark:text-zinc-200"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* 첨부 이미지 칩 */}
          {(attachments.length > 0 || uploading) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {attachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  📎 {a.name.slice(0, 24)}
                  <button
                    onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                    className="text-zinc-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {uploading && <span className="text-xs text-zinc-400">업로드 중…</span>}
            </div>
          )}
          {/* 빠른 액션 — 클릭 즉시 실행(보내기 불필요). 아이콘=계속/중단/승인/커밋, 텍스트=추천/테스트/요약 */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <button
              onClick={continueWork}
              data-hint={HINT.continue}
              title="계속 진행"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              ▶️
            </button>
            <button
              onClick={proceedAll}
              data-hint={HINT.proceedAll}
              title="전부 진행 (막힐 때만 묻고 끝까지)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              ⏩
            </button>
            <button
              onClick={sendEsc}
              data-hint={HINT.esc}
              title="중단 (Esc)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              ⏹️
            </button>
            <button
              onClick={approve}
              data-hint={HINT.approve}
              title="승인 (권한 프롬프트 Yes)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              ✅
            </button>
            <button
              onClick={commitWork}
              data-hint={HINT.commit}
              title="배포 (커밋·푸시·배포)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              🚢
            </button>
            <button
              onClick={clearContext}
              data-hint={HINT.clear}
              title="컨텍스트 클리어 (/clear)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              🧹
            </button>
            <button
              onClick={compactContext}
              data-hint={HINT.compact}
              title="컨텍스트 압축 (/compact)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              🗜️
            </button>
            <button
              onClick={focusSafari}
              data-hint={HINT.safari}
              title="사파리 창 띄우기 (관제판 앞으로)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              🪟
            </button>
            <button
              onClick={revealTab}
              title="이 세션의 iTerm 탭을 화면 앞으로 가져오기"
              className="rounded-full border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              🔎
            </button>
            <select
              value=""
              onChange={(e) => changeModel(e.target.value)}
              title="모델 변경 (/model)"
              className="rounded-full border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <option value="" disabled>
                🤖 모델
              </option>
              <option value="default">기본(default)</option>
              <option value="fable">Fable 5</option>
              <option value="opus">Opus 4.8</option>
              <option value="sonnet">Sonnet 4.6</option>
              <option value="haiku">Haiku 4.5</option>
              <option value="opusplan">Opus Plan(계획=Opus 4.8·실행=Sonnet 4.6)</option>
            </select>
            <span className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
            <button
              onClick={recommendNext}
              data-hint={HINT.recommend}
              className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
            >
              🧭 다음 작업 추천받기
            </button>
            <button
              onClick={proposeSolution}
              data-hint={HINT.solution}
              className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
            >
              💡 해결책 제안
            </button>
            <button
              onClick={runCheck}
              data-hint={HINT.check}
              className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
            >
              🧪 테스트/빌드 점검
            </button>
            <button
              onClick={statusSummary}
              data-hint={HINT.status}
              className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
            >
              📊 현황 요약
            </button>
            <button
              onClick={progressStatus}
              data-hint={HINT.progress}
              className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
            >
              📍 진행상황
            </button>
            <button
              onClick={interview}
              data-hint={HINT.interview}
              className="rounded-full border border-teal-400 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/20"
            >
              🎤 인터뷰
            </button>
            <button
              onClick={blindspot}
              data-hint={HINT.blindspot}
              className="rounded-full border border-teal-400 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/20"
            >
              🔍 블라인드스팟
            </button>
            <button
              onClick={implNotes}
              data-hint={HINT.implNotes}
              className="rounded-full border border-teal-400 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/20"
            >
              📝 구현노트
            </button>
            <button
              onClick={quiz}
              data-hint={HINT.quiz}
              className="rounded-full border border-teal-400 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/20"
            >
              🧠 퀴즈
            </button>
            <button
              onClick={makePrd}
              data-hint={HINT.prd}
              className="rounded-full border border-indigo-400 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
            >
              📋 PRD
            </button>
            <button
              onClick={uiGuide}
              data-hint={HINT.uiGuide}
              className="rounded-full border border-fuchsia-400 bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100 dark:border-fuchsia-500/40 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:hover:bg-fuchsia-500/20"
            >
              🧩 디자인 시스템
            </button>
            <button
              onClick={designMockup}
              data-hint={HINT.design}
              className="rounded-full border border-fuchsia-400 bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100 dark:border-fuchsia-500/40 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:hover:bg-fuchsia-500/20"
            >
              🎨 디자인/목업
            </button>
            <button
              onClick={userTest}
              data-hint={HINT.userTest}
              className="rounded-full border border-violet-400 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
            >
              🕵️ 유저테스트
            </button>
            <button
              onClick={deployNeonCloudRun}
              data-hint={HINT.deploy}
              className="rounded-full border border-sky-400 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
            >
              🚀 배포(Neon+CloudRun)
            </button>
          </div>
          {/* 골(목표) + 워크플로우(순차 자동 실행) — 패널만 열고 명시적 액션에서만 전송 */}
          <SessionWorkflow session={session} />
          {/* 입력 + 이미지 드래그&드롭/붙여넣기 */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
            className={`flex items-center gap-2 rounded ${
              dragOver ? "ring-2 ring-emerald-400 ring-offset-1 dark:ring-offset-zinc-900" : ""
            }`}
          >
            <input
              ref={inputRef}
              value={sendText}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send(sendText);
              }}
              onPaste={(e) => {
                // 1) 파일 붙여넣기
                const files = [...e.clipboardData.items]
                  .filter((it) => it.kind === "file")
                  .map((it) => it.getAsFile())
                  .filter((f): f is File => !!f);
                if (files.length) {
                  uploadFiles(files);
                  return;
                }
                // 2) 아주 긴 텍스트는 입력칸에 넣지 말고 .txt 파일로 첨부 (렉·잘림 방지)
                const txt = e.clipboardData.getData("text");
                if (txt && txt.length >= PASTE_FILE_THRESHOLD) {
                  e.preventDefault();
                  const stamp = new Date()
                    .toISOString()
                    .slice(0, 16)
                    .replace(/[-:T]/g, "");
                  const file = new File([txt], `pasted-${txt.length}chars-${stamp}.txt`, {
                    type: "text/plain",
                  });
                  uploadFiles([file]);
                }
              }}
              placeholder={dragOver ? "여기에 파일 드롭" : "명령/요청 입력 (파일 드래그&드롭 가능) → Enter"}
              className="min-w-0 flex-1 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
            <button
              onClick={() => send(sendText)}
              className="shrink-0 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
            >
              보내기
            </button>
          </div>
          {!(session.iterm_id || session.tty) && (
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              ⓘ iTerm/Terminal에서 켠 세션만 실제 전송돼요.
            </p>
          )}
          {sendErr && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{sendErr}</p>}
        </div>
      )}
    </div>
  );
}
