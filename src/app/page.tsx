"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionRow } from "@/lib/db";
import { STATUS_WEIGHT, type SessionStatus } from "@/lib/status";
import { STATUS_META, FRESH_META, freshness, relativeTime } from "@/lib/ui";
import { isTransientError, needsAttention, lastActionLine, isDead } from "@/lib/sessionView";
import { useImageUpload } from "@/lib/useImageUpload";
import type { Project } from "@/components/ProjectCard";
import { SessionDetail } from "@/components/SessionDetail";
import { SessionRail } from "@/components/SessionRail";
import { VoiceNotes } from "@/components/VoiceNotes";
import { SessionAccordion } from "@/components/SessionAccordion";
import { ThemeToggle } from "@/components/ThemeToggle";

function sortSessions(rows: SessionRow[]): SessionRow[] {
  return [...rows].sort(
    (a, b) =>
      (isDead(a) ? 1 : 0) - (isDead(b) ? 1 : 0) || // 죽은(💀: dead 또는 ended) 세션은 맨 아래
      STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] ||
      b.last_event_at - a.last_event_at,
  );
}

// 헤더 요약에 표시할 상태 순서 (종료는 생략)
const SUMMARY_ORDER: SessionStatus[] = ["working", "compacting", "waiting", "idle", "error"];

export default function Home() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [home, setHome] = useState("");
  const [tab, setTab] = useState<"projects" | "periodic" | "notes">("projects");
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null); // 상세 드로어
  const [railId, setRailId] = useState<string | null>(null); // 우측 패널에 띄울 세션
  const [favorites, setFavorites] = useState<string[]>([]); // 즐겨찾기 project_root (클릭 순서)
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]); // 사용자 카테고리(순서)
  const [assign, setAssign] = useState<Record<string, string>>({}); // project_root → categoryId
  const [order, setOrder] = useState<string[]>([]); // 사용자 수동 정렬(project_root 순서)
  const [dragging, setDragging] = useState(false); // 페이지 전역 이미지 드래그 중
  const upload = useImageUpload(); // 우측 패널 세션과 공유하는 이미지 첨부
  const [autoRetry, setAutoRetry] = useState(true); // 일시 에러(rate limit) 자동 재시도
  const [autoResume, setAutoResume] = useState(true); // 멈춤(도구호출 텍스트로 뱉음) 자동 교정·계속
  const sessionsRef = useRef<SessionRow[]>([]);
  sessionsRef.current = sessions;
  const retryRef = useRef<Map<string, number>>(new Map()); // session_id → 재시도 횟수
  const resumeRef = useRef<Map<string, { at: number; n: number }>>(new Map()); // stuck 교정 dedup+상한
  const [interacting, setInteracting] = useState(false); // 입력 중이면 레일 정렬 freeze
  const lastOrderRef = useRef<string[]>([]); // 마지막 레일 순서(freeze용)
  const pinnedRef = useRef(false); // 초기 우측 패널 고정 1회
  const [notif, setNotif] = useState(false); // OS 데스크톱 알림 켜짐
  const prevNeedRef = useRef<Map<string, boolean>>(new Map()); // 세션별 직전 '주의 필요' 상태

  // 초기 스냅샷
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => {
        setSessions(d.sessions ?? []);
        setHome(d.home ?? "");
      })
      .catch(() => {});
  }, []);

  // 실시간 갱신 (SSE) — 이벤트를 120ms 단위로 배칭해 리렌더 폭주를 막는다.
  // 여러 세션이 동시에 도구 이벤트를 쏟아도 프레임당 한 번만 setSessions.
  useEffect(() => {
    const es = new EventSource("/api/stream");
    const pending = new Map<string, SessionRow>();
    const deleted = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (pending.size === 0 && deleted.size === 0) return;
      const adds = [...pending.entries()];
      const dels = [...deleted];
      pending.clear();
      deleted.clear();
      setSessions((prev) => {
        const map = new Map(prev.map((s) => [s.session_id, s]));
        for (const id of dels) map.delete(id);
        for (const [id, row] of adds) map.set(id, row);
        return sortSessions([...map.values()]);
      });
    };
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.__deleted) {
        deleted.add(data.__deleted);
        pending.delete(data.__deleted);
      } else {
        pending.set(data.session_id, data);
        deleted.delete(data.session_id);
      }
      if (timer == null) timer = setTimeout(flush, 120);
    };
    return () => {
      es.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 상대시간 표시 갱신용 틱
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  // 실제 생존 자동 판정: 20초마다 각 세션의 claude 실행 여부로 💀(dead)를 맞춘다.
  // 동시에 iTerm 탭 제목을 프로젝트명으로 고정(claude가 바꿔도 되돌림).
  useEffect(() => {
    const run = () => {
      fetch("/api/reconcile", { method: "POST" }).catch(() => {});
      fetch("/api/set-titles", { method: "POST" }).catch(() => {});
    };
    run(); // 초기 1회
    const iv = setInterval(run, 20000);
    return () => clearInterval(iv);
  }, []);

  // 즐겨찾기 + 카테고리 불러오기
  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem("flow-favorites") || "[]");
      if (Array.isArray(f)) setFavorites(f);
      const c = JSON.parse(localStorage.getItem("flow-categories") || "[]");
      if (Array.isArray(c)) setCategories(c);
      const a = JSON.parse(localStorage.getItem("flow-assign") || "{}");
      if (a && typeof a === "object") setAssign(a);
      const o = JSON.parse(localStorage.getItem("flow-order") || "[]");
      if (Array.isArray(o)) setOrder(o);
    } catch {}
  }, []);

  function saveOrder(next: string[]) {
    setOrder(next);
    localStorage.setItem("flow-order", JSON.stringify(next));
  }
  // 같은 그룹(카테고리) 안에서 프로젝트를 위/아래로 이동 (수동 순서 저장)
  function moveProject(root: string, dir: -1 | 1) {
    const g = railGroups.find((grp) => grp.projects.some((p) => p.root === root));
    if (!g) return;
    const roots = g.projects.map((p) => p.root); // 현재 그룹 내 순서
    const i = roots.indexOf(root);
    const j = i + dir;
    if (j < 0 || j >= roots.length) return;
    // 전체 표시 순서를 명시적 order로 만든 뒤 두 항목 위치 교환
    const all = orderedProjects.map((p) => p.root);
    const ai = all.indexOf(root);
    const bi = all.indexOf(roots[j]);
    if (ai < 0 || bi < 0) return;
    const next = [...all];
    [next[ai], next[bi]] = [next[bi], next[ai]];
    saveOrder(next);
  }

  function toggleFavorite(root: string) {
    setFavorites((prev) => {
      const next = prev.includes(root) ? prev.filter((r) => r !== root) : [...prev, root];
      localStorage.setItem("flow-favorites", JSON.stringify(next));
      return next;
    });
  }

  function saveCategories(next: { id: string; name: string }[]) {
    setCategories(next);
    localStorage.setItem("flow-categories", JSON.stringify(next));
  }
  function saveAssign(next: Record<string, string>) {
    setAssign(next);
    localStorage.setItem("flow-assign", JSON.stringify(next));
  }
  function addCategory() {
    const name = prompt("카테고리 이름")?.trim();
    if (name) saveCategories([...categories, { id: `c${Date.now()}`, name }]);
  }
  function renameCategory(id: string) {
    const cur = categories.find((c) => c.id === id);
    const name = prompt("카테고리 이름 변경", cur?.name)?.trim();
    if (name) saveCategories(categories.map((c) => (c.id === id ? { ...c, name } : c)));
  }
  function deleteCategory(id: string) {
    saveCategories(categories.filter((c) => c.id !== id));
    const next = { ...assign };
    for (const k of Object.keys(next)) if (next[k] === id) delete next[k];
    saveAssign(next);
  }
  function moveCategory(id: string, dir: -1 | 1) {
    const i = categories.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[i], next[j]] = [next[j], next[i]];
    saveCategories(next);
  }
  function assignProject(root: string, catId: string | null) {
    const next = { ...assign };
    if (catId) next[root] = catId;
    else delete next[root];
    saveAssign(next);
  }

  const counts = useMemo(() => {
    const c: Record<SessionStatus, number> = {
      working: 0,
      compacting: 0,
      waiting: 0,
      idle: 0,
      error: 0,
      ended: 0,
    };
    for (const s of sessions) c[s.status]++;
    return c;
  }, [sessions]);

  // 폴더(project_root) 단위로 묶기 — 옵션 D
  const projects = useMemo<Project[]>(() => {
    const map = new Map<string, Project>();
    for (const s of sessions) {
      if (home && s.project_root === home) continue; // 홈 루트 = 주기작업, 프로젝트에서 제외
      let p = map.get(s.project_root);
      if (!p) {
        p = {
          root: s.project_root,
          name: s.project_name, // 임시(폴더명) — alias 있는 세션을 만나면 아래에서 교체
          folder: s.project_name,
          alias: null,
          sessions: [],
        };
        map.set(s.project_root, p);
      }
      // 같은 프로젝트 세션 중 alias가 있으면 그걸 이름으로 확정(세션 순서와 무관하게 안정적)
      if (s.alias && !p.alias) {
        p.alias = s.alias;
        p.name = s.alias;
      }
      p.sessions.push(s);
    }
    const arr = [...map.values()];
    // 고정 순서: 상태가 바뀌어도 위치가 안 움직이게. 세션은 생성순(고정).
    for (const p of arr)
      p.sessions.sort((a, b) => a.created_at - b.created_at);
    const favIdx = (root: string) => {
      const i = favorites.indexOf(root);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const ordIdx = (root: string) => {
      const i = order.indexOf(root);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    arr.sort((a, b) => {
      // 1순위: 내가 수동으로 정한 순서. 안 정한 건 즐겨찾기→이름순(고정).
      const oa = ordIdx(a.root);
      const ob = ordIdx(b.root);
      if (oa !== ob) return oa - ob;
      const fa = favIdx(a.root);
      const fb = favIdx(b.root);
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [sessions, home, favorites, order]);

  // 입력 중(interacting)이면 직전 순서를 유지(레일이 위아래로 안 움직이게). 아니면 새로 정렬.
  const orderedProjects = useMemo(() => {
    if (interacting && lastOrderRef.current.length) {
      const idx = (root: string) => {
        const i = lastOrderRef.current.indexOf(root);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i; // 새 프로젝트는 맨 뒤
      };
      return [...projects].sort((a, b) => idx(a.root) - idx(b.root));
    }
    lastOrderRef.current = projects.map((p) => p.root);
    return projects;
  }, [projects, interacting]);

  // 주기작업 = 홈 루트에서 도는 세션 (최근 실행순)
  const periodic = useMemo(
    () =>
      sessions
        .filter((s) => home && s.project_root === home)
        .sort((a, b) => b.last_event_at - a.last_event_at),
    [sessions, home],
  );

  // 우측 패널에 띄울 세션 (railId 우선, 없으면 첫 프로젝트의 첫 세션)
  const railSelected = useMemo(() => {
    const byId = railId ? sessions.find((s) => s.session_id === railId) : null;
    return byId ?? orderedProjects[0]?.sessions[0] ?? null;
  }, [railId, sessions, orderedProjects]);
  const railProject = railSelected
    ? orderedProjects.find((p) => p.sessions.some((s) => s.session_id === railSelected.session_id))
    : null;

  // 초기 1회: 우측 패널 고정(이후 정렬이 바뀌어도 자동 전환 안 함. 클릭으로만 변경)
  useEffect(() => {
    if (!pinnedRef.current && !railId && orderedProjects[0]?.sessions[0]) {
      pinnedRef.current = true;
      setRailId(orderedProjects[0].sessions[0].session_id);
    }
  }, [orderedProjects, railId]);

  // 미열람 강조: 세션별 "마지막 열람 시각"(seen)을 기록하고, 그 뒤 새 응답이 오면 형광 링.
  // 최신 응답 시각 = 턴 종료(last_stop_at) 또는 최근 진행단계([flow] step) 중 더 나중.
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem("flow-seen") || "{}"));
    } catch {}
  }, []);
  // "결과가 왔다"의 최신 시각. recentSteps는 오름차순(오래된→최신)이라 마지막이 최신.
  const latestAt = useCallback((s: SessionRow) => {
    const steps = s.recentSteps ?? [];
    const lastStep = steps.length ? steps[steps.length - 1].created_at : 0;
    return Math.max(s.last_stop_at ?? 0, lastStep);
  }, []);
  // 처음 보는 세션은 현재 응답 시각을 기준선으로 저장(기존 응답은 읽음 처리) → 이후 새 응답만 미열람
  useEffect(() => {
    setSeen((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of sessions) {
        if (next[s.session_id] == null) {
          next[s.session_id] = latestAt(s);
          changed = true;
        }
      }
      if (changed) localStorage.setItem("flow-seen", JSON.stringify(next));
      return changed ? next : prev;
    });
  }, [sessions, latestAt]);
  const markSeen = useCallback(
    (id: string) => {
      const s = sessions.find((x) => x.session_id === id);
      if (!s) return;
      setSeen((prev) => {
        const val = Math.max(latestAt(s), prev[id] ?? 0);
        if (prev[id] === val) return prev;
        const next = { ...prev, [id]: val };
        localStorage.setItem("flow-seen", JSON.stringify(next));
        return next;
      });
    },
    [sessions, latestAt],
  );
  // 지금 보고 있는 세션(railSelected)은 새 응답이 와도 계속 읽음 유지
  useEffect(() => {
    if (railSelected) markSeen(railSelected.session_id);
  }, [railSelected, markSeen]);
  const isUnread = useCallback(
    (s: SessionRow) =>
      s.session_id !== railSelected?.session_id && latestAt(s) > (seen[s.session_id] ?? latestAt(s)),
    [railSelected, seen, latestAt],
  );
  // 세션 선택 = 열람 처리
  const selectRail = useCallback(
    (id: string) => {
      setRailId(id);
      markSeen(id);
    },
    [markSeen],
  );

  // 입력칸에 포커스 있으면 레일 정렬 freeze (타이핑 중 안 움직이게)
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onIn = (e: FocusEvent) => {
      if (isField(e.target)) setInteracting(true);
    };
    const onOut = (e: FocusEvent) => {
      if (isField(e.target)) setTimeout(() => setInteracting(false), 400);
    };
    window.addEventListener("focusin", onIn);
    window.addEventListener("focusout", onOut);
    return () => {
      window.removeEventListener("focusin", onIn);
      window.removeEventListener("focusout", onOut);
    };
  }, []);

  // 카테고리별로 묶기 (projects는 수동순서→즐겨찾기→이름순 고정 → 그룹 내 순서 그대로 유지)
  const railGroups = useMemo(() => {
    const byId: Record<string, Project[]> = {};
    for (const c of categories) byId[c.id] = [];
    const uncat: Project[] = [];
    for (const p of orderedProjects) {
      const cid = assign[p.root];
      if (cid && byId[cid]) byId[cid].push(p);
      else uncat.push(p);
    }
    // 미분류(새/활성 세션 기본 위치)를 맨 위로, 그 아래 사용자 카테고리들
    return [
      { id: "__uncat__", name: "미분류", projects: uncat },
      ...categories.map((c) => ({ id: c.id, name: c.name, projects: byId[c.id] })),
    ];
  }, [orderedProjects, categories, assign]);

  // 페이지 어디에 드롭/붙여넣어도 현재 열린(우측) 세션에 이미지 첨부
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files?.length) upload.uploadFiles(e.dataTransfer.files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((it) => it.kind === "file")
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length) upload.uploadFiles(files);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [upload]);

  // 다른 세션으로 전환하면 첨부 비우기 (엉뚱한 세션에 딸려가지 않게)
  useEffect(() => {
    upload.setAttachments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railSelected?.session_id]);

  // 탭 제목 배지: 내 응답이 필요한 세션 수 → "(N) project_flow". iTerm에서 작업 중에도 흘끗 보임.
  useEffect(() => {
    const n = sessions.filter((s) => needsAttention(s) || s.status === "error").length;
    document.title = n > 0 ? `(${n}) project_flow` : "project_flow";
  }, [sessions]);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotif(Notification.permission === "granted");
  }, []);
  function toggleNotif() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      setNotif((v) => !v); // 끄기/켜기 (권한은 유지)
    } else {
      Notification.requestPermission().then((p) => setNotif(p === "granted"));
    }
  }

  // OS 데스크톱 알림: 세션이 새로 '내 응답 필요' 상태가 되면 한 번 알림 (working→대기/에러/질문 전이)
  useEffect(() => {
    for (const s of sessions) {
      const need = needsAttention(s) || s.status === "error";
      const prev = prevNeedRef.current.get(s.session_id);
      if (notif && need && prev === false) {
        const name = s.alias || s.project_name;
        const why =
          s.status === "error"
            ? "⚠️ 에러"
            : s.pending_question
              ? "❓ 질문 대기"
              : s.status === "waiting"
                ? "❓ 선택 대기"
                : "💬 응답 필요";
        try {
          new Notification(`${name} — ${why}`, {
            body: lastActionLine(s).slice(0, 90),
            tag: s.session_id,
          });
        } catch {}
      }
      prevNeedRef.current.set(s.session_id, need);
    }
  }, [sessions, notif]);

  // autoRetry / autoResume 설정 불러오기
  useEffect(() => {
    const v = localStorage.getItem("flow-autoretry");
    if (v != null) setAutoRetry(v === "1");
    const r = localStorage.getItem("flow-autoresume");
    if (r != null) setAutoResume(r === "1");
  }, []);
  function toggleAutoResume() {
    setAutoResume((v) => {
      localStorage.setItem("flow-autoresume", v ? "0" : "1");
      return !v;
    });
  }
  // 새 프로젝트: ~/<이름> 폴더 생성 → git init → 새 iTerm에서 claude 실행
  async function newProject() {
    const name = window.prompt("새 프로젝트 이름 (폴더명이 됩니다 — ~/<이름> 생성 후 claude 실행)");
    if (!name?.trim()) return;
    const r = await fetch("/api/project-new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).then((x) => x.json());
    if (r.ok) {
      alert(`✅ ${r.dir} 생성 — iTerm에서 claude가 켜졌어요.\n세션이 시작되면 왼쪽에 나타납니다.`);
    } else {
      alert(`실패: ${r.error || ""}`);
    }
  }
  function toggleAutoRetry() {
    setAutoRetry((v) => {
      localStorage.setItem("flow-autoretry", v ? "0" : "1");
      return !v;
    });
  }

  // 일시 에러(rate limit 등) 자동 재시도: 5초마다 "계속 진행해줘"(silent). 복구되면 카운트 리셋, 상한 30회.
  useEffect(() => {
    if (!autoRetry) return;
    const RETRY_CAP = 30;
    const iv = setInterval(() => {
      for (const s of sessionsRef.current) {
        if (s.status === "error" && isTransientError(s.error_reason)) {
          const n = retryRef.current.get(s.session_id) ?? 0;
          if (n >= RETRY_CAP) continue;
          retryRef.current.set(s.session_id, n + 1);
          fetch("/api/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: s.session_id,
              text: "계속 진행해줘.",
              enter: true,
              silent: true,
            }),
          }).catch(() => {});
        } else {
          retryRef.current.delete(s.session_id); // 복구/비에러면 리셋
        }
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [autoRetry]);

  // 멈춤(stuck) 자동 교정·계속: 도구 호출을 실행하지 않고 마크업을 텍스트로만 뱉고 끝난 세션을
  // 감지하면, "마크업 금지 + 실제 도구 실행 + 계속 진행" 교정 프롬프트를 자동으로 보낸다.
  useEffect(() => {
    if (!autoResume) return;
    const STUCK_FIX =
      "방금 턴에서 도구 호출을 실제로 실행하지 않고 `<invoke name=...>` 같은 마크업을 답변 텍스트로만 출력한 채 멈췄어. " +
      "도구 호출 마크업은 절대 텍스트로 쓰지 말고, 반드시 실제 도구로 호출해서 실행해야 해. " +
      "지금 하려던 그 작업(도구 실행)을 실제로 실행해서 멈추지 말고 계속 진행해줘.";
    const CAP = 5;
    for (const s of sessions) {
      if (s.status === "idle" && s.stuck) {
        const rec = resumeRef.current.get(s.session_id);
        if (rec && rec.at === s.last_event_at) continue; // 같은 멈춤 이미 처리
        const n = rec?.n ?? 0;
        if (n >= CAP) continue; // 상한(무한 교정 방지)
        resumeRef.current.set(s.session_id, { at: s.last_event_at, n: n + 1 });
        fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: s.session_id,
            text: STUCK_FIX,
            enter: true,
            display: "🔧 멈춤 감지 → 교정·계속",
          }),
        }).catch(() => {});
      } else if (!s.stuck) {
        resumeRef.current.delete(s.session_id); // 정상 복귀 시 상한 리셋
      }
    }
  }, [sessions, autoResume]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex min-h-0 flex-1 flex-col px-5 py-3" style={{ maxWidth: "none" }}>
        {/* 헤더 */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-700">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            project_flow
          </h1>
          <div className="flex items-center gap-2 text-sm">
            {SUMMARY_ORDER.map((st) => (
              <span
                key={st}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${STATUS_META[st].chip}`}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_META[st].dot}`} />
                {STATUS_META[st].label}
                <span className="tabular-nums font-bold">{counts[st]}</span>
              </span>
            ))}
            <button
              onClick={async () => {
                const n = sessions.filter(
                  (s) => s.status !== "ended" && s.project_root !== home && s.cwd,
                ).length;
                if (!n || !confirm(`현재 안 열린(닫힌) 세션만 골라 iTerm 탭으로 다시 띄울까요? (각 폴더에서 claude --resume)`))
                  return;
                const r = await fetch("/api/restore", { method: "POST" }).then((x) => x.json());
                alert(
                  !r.ok
                    ? `복구 실패: ${r.error || ""}`
                    : r.allOpen || r.count === 0
                      ? "✅ 모든 세션이 이미 열려있어요 — 복구할 게 없습니다."
                      : `✅ 닫혀있던 ${r.count}개 세션을 복구 중…`,
                );
              }}
              title="iTerm에 안 열려있는 세션만 폴더별로 다시 띄워 claude --resume"
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              🔌 세션 복구
            </button>
            <button
              onClick={async () => {
                const cutoff = Date.now() - 3 * 86400000;
                const targets = sessions.filter(
                  (s) => !s.dead && s.status !== "ended" && s.last_event_at < cutoff,
                );
                if (!targets.length) {
                  alert("3일 이상 방치된 세션이 없어요.");
                  return;
                }
                if (
                  !confirm(
                    `3일 이상 방치된 ${targets.length}개 세션을 죽여서 메모리를 회수할까요?\n(목록엔 💀로 남고 언제든 되살릴 수 있어요)`,
                  )
                )
                  return;
                const r = await fetch("/api/kill", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ session_ids: targets.map((s) => s.session_id) }),
                }).then((x) => x.json());
                alert(r.ok ? `✅ ${r.count}개 죽임 — 메모리 회수 중 (💀로 보존됨)` : `실패: ${r.error || ""}`);
              }}
              title="3일 이상 방치된 세션의 iTerm 탭을 닫아 메모리 회수 (목록엔 💀로 보존)"
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              🧹 오래된 세션 정리
            </button>
            <button
              onClick={async () => {
                const pre = await fetch("/api/close-idle-tabs").then((x) => x.json());
                if (!pre.ok || pre.count === 0) {
                  alert("닫을 빈 탭이 없어요. (claude 세션·작업 중인 탭은 제외돼요)");
                  return;
                }
                if (
                  !confirm(
                    `Claude 세션이 아니고 아무것도 안 도는 빈 iTerm 탭 ${pre.count}개를 닫을까요?\n(claude·서버·수집 등이 도는 탭은 자동 제외)`,
                  )
                )
                  return;
                const r = await fetch("/api/close-idle-tabs", { method: "POST" }).then((x) => x.json());
                alert(r.ok ? `✅ 빈 탭 ${r.count}개를 닫았어요` : `실패: ${r.error || ""}`);
              }}
              title="Claude 세션이 아니고 아무 작업도 안 도는 빈 iTerm 탭만 닫기 (서버·수집 탭은 제외)"
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              🗑 빈 탭 닫기
            </button>
            <button
              onClick={toggleNotif}
              title="OS 데스크톱 알림 — 세션이 나를 기다리면 팝업"
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                notif
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              🔔 알림 {notif ? "ON" : "OFF"}
            </button>
            <button
              onClick={toggleAutoRetry}
              title="일시 에러(rate limit) 자동 재시도: 5초마다 '계속 진행해줘'"
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                autoRetry
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              🔄 자동재시도 {autoRetry ? "ON" : "OFF"}
            </button>
            <button
              onClick={toggleAutoResume}
              title="멈춤 자동 교정: 도구호출을 텍스트로만 뱉고 멈춘 세션에 '실제 실행하고 계속' 자동 전송"
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                autoResume
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              🔧 멈춤교정 {autoResume ? "ON" : "OFF"}
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* 탭 */}
        <div className="mt-1.5 flex items-center gap-1 border-b border-zinc-200 text-sm dark:border-zinc-700">
          <button
            onClick={() => setTab("projects")}
            className={`-mb-px border-b-2 px-3 py-1.5 font-medium ${
              tab === "projects"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            프로젝트 <span className="text-zinc-400">{projects.length}</span>
          </button>
          <button
            onClick={() => setTab("periodic")}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-medium ${
              tab === "periodic"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {periodic.length > 0 && (
              <span
                className={`h-2 w-2 rounded-full ${FRESH_META[freshness(periodic[0].last_event_at, now)].dot} ${
                  freshness(periodic[0].last_event_at, now) === "live" ? "animate-pulse" : ""
                }`}
              />
            )}
            주기작업 <span className="text-zinc-400">{periodic.length}</span>
            {periodic.length > 0 && (
              <span className="text-xs font-normal text-zinc-400">
                (마지막 실행 {relativeTime(periodic[0].last_event_at, now)})
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("notes")}
            className={`-mb-px border-b-2 px-3 py-1.5 font-medium ${
              tab === "notes"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            📼 음성노트
          </button>
          <span className="ml-auto flex items-center gap-1 text-xs text-zinc-400">
            <span className="mr-0.5">레이아웃 데모:</span>
            <Link href="/demo/kanban" className="rounded px-1.5 py-0.5 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">칸반</Link>
            <Link href="/demo/wall" className="rounded px-1.5 py-0.5 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">전광판</Link>
            <Link href="/demo/feed" className="rounded px-1.5 py-0.5 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">피드</Link>
          </span>
        </div>

        {/* 내용 */}
        {tab === "notes" ? (
          <VoiceNotes />
        ) : tab === "projects" ? (
          projects.length === 0 ? (
            <div className="mt-16 text-center text-sm text-zinc-500 dark:text-zinc-300">
              <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">
                아직 프로젝트 세션이 없어요.
              </p>
              <p className="mt-2">플러그인을 설치하고 프로젝트 폴더에서 claude를 켜면 나타납니다.</p>
            </div>
          ) : (
            <div
              className="mt-3"
              style={{ display: "flex", gap: 20, alignItems: "stretch", flex: 1, minHeight: 0 }}
            >
              {/* 좌측: 전체 목록 — 폭 고정 + 내부 스크롤 + 하단 새 프로젝트 버튼 */}
              <div
                style={{ width: 288, flexShrink: 0, flexGrow: 0, display: "flex", flexDirection: "column" }}
              >
                <div
                  style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}
                >
                  <SessionRail
                    groups={railGroups}
                    selectedId={railSelected?.session_id ?? null}
                    onSelect={selectRail}
                    favorites={favorites}
                    onToggleStar={toggleFavorite}
                    now={now}
                    onAssign={assignProject}
                    onAddCategory={addCategory}
                    onRenameCategory={renameCategory}
                    onDeleteCategory={deleteCategory}
                    onMoveCategory={moveCategory}
                    onMoveProject={moveProject}
                    isUnread={isUnread}
                  />
                </div>
                {/* 새 프로젝트: ~/<이름> 폴더 생성 → git init → iTerm에서 claude 실행 */}
                <button
                  onClick={newProject}
                  title="새 프로젝트: ~/<이름> 폴더 생성 → git init → iTerm에서 claude 실행"
                  className="mt-2 shrink-0 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                >
                  ➕ 새 프로젝트
                </button>
              </div>
              {/* 우측: 선택한 세션 상세 — 고정 높이(입력칸은 하단 고정, 내용만 스크롤) */}
              <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}>
                {railSelected ? (
                  <>
                    <div className="mb-2 flex shrink-0 items-baseline gap-2">
                      <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                        {railProject?.name ?? railSelected.project_name}
                      </h2>
                      {railProject && railProject.folder !== railProject.name && (
                        <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {railProject.folder}/
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <SessionAccordion
                        key={railSelected.session_id}
                        session={railSelected}
                        now={now}
                        onOpenDetail={() => setSelectedId(railSelected.session_id)}
                        upload={upload}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
                    왼쪽에서 세션을 선택하세요.
                  </div>
                )}
              </div>
            </div>
          )
        ) : periodic.length === 0 ? (
          <div className="mt-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
            홈 루트(주기작업)에서 실행된 세션이 아직 없어요.
          </div>
        ) : (
          <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {periodic.map((s) => {
              const f = freshness(s.last_event_at, now);
              const fm = FRESH_META[f];
              return (
                <button
                  key={s.session_id}
                  onClick={() => setSelectedId(s.session_id)}
                  className="flex w-full items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${fm.dot} ${fm.blink ? "animate-pulse" : ""}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">
                    {s.just_did || s.last_activity || s.session_title || s.last_event || "—"}
                  </span>
                  <span
                    className={`shrink-0 text-xs ${
                      f === "stale"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    마지막 실행 {relativeTime(s.last_event_at, now)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 전역 이미지 드래그 오버레이 */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-emerald-500/10 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-emerald-400 bg-white/90 px-8 py-6 text-center shadow-lg dark:bg-zinc-900/90">
            <p className="text-2xl">📎</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
              파일을 여기에 드롭
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {railSelected
                ? `→ ${railProject?.name ?? railSelected.project_name} 세션에 첨부`
                : "세션을 먼저 선택하세요"}
            </p>
          </div>
        </div>
      )}

      {/* 상세 패널 */}
      {selectedId && (
        <SessionDetail sessionId={selectedId} onClose={() => setSelectedId(null)} />
      )}

    </div>
  );
}
