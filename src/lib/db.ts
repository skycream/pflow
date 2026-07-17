// SQLite 저장소 + hook 이벤트 수집 핵심 로직.
// 로컬 단일 사용자용이므로 동기 드라이버(better-sqlite3)를 사용한다.

import Database from "better-sqlite3";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { deriveStatus, STATUS_WEIGHT, type SessionStatus } from "./status";

// 세션 1행 = 대시보드 카드 1개
export interface SessionRow {
  session_id: string;
  cwd: string;
  project_root: string; // 프로젝트 루트 경로 (.git 기준). 별명(alias)의 키.
  project_name: string; // 프로젝트 루트 폴더명 (.git 루트 기준)
  alias: string | null; // 프로젝트(폴더) 별명 (projects 테이블 조인)
  session_alias: string | null; // 이 세션 개별 별명
  tmux_pane: string | null; // (레거시) tmux pane
  tty: string | null; // Apple Terminal 제어용 tty (예: /dev/ttys003)
  iterm_id: string | null; // iTerm2 제어용 ITERM_SESSION_ID
  next_options: string | null; // [flow-next] 다음 작업 옵션 (JSON 배열 문자열)
  recap: string | null; // Claude Code away_summary (세션 총정리)
  transcript_path: string | null; // 전체 대화 transcript 파일 경로
  pending_question: string | null; // AskUserQuestion 대기 중 선택지 (JSON: {question, options[]})
  session_title: string | null; // Claude가 붙인 세션 제목 = 부제목
  source: string; // 어느 도구인지 (claude/codex/gemini…). 현재는 전부 'claude'
  status: SessionStatus;
  stage: string | null;
  just_did: string | null;
  next_action: string | null;
  blocker: string | null;
  last_tool: string | null;
  last_event: string | null;
  last_activity: string | null; // "무엇을 하는지" 사람이 읽을 수 있는 한 줄 (Tier1: tool_input 기반)
  last_event_at: number;
  last_stop_at: number | null; // 마지막 턴 종료(Stop) 시각 — "응답 왔다" 판정용([flow] 없이도)
  last_prompt_at: number | null; // 마지막 프롬프트 접수(UserPromptSubmit) 시각 — 내 메시지 처리 판정용
  stuck: number | null; // 1이면 도구호출을 텍스트로만 뱉고 멈춤(실행 안 함) — 자동 교정 대상
  dead: number | null; // 1이면 내가 프로세스를 죽인 세션(💀). 목록엔 유지 — 되살리거나 완전삭제 전까지 보존
  error_reason: string | null; // 턴 실패 사유(API rate limit 등) — 에러 상태일 때만
  created_at: number;
  recentSteps?: StepRow[]; // 최근 진행 단계 5개 (인라인 표시용, 조회 시 부착)
  recentSent?: SentRow[]; // 내가 보낸 최근 요청 (조회 시 부착)
}

// 실시간 푸시(SSE)를 위한 인-프로세스 이벤트 버스. 세션이 갱신될 때 발행된다.
export const bus = new EventEmitter();
bus.setMaxListeners(0); // SSE 클라이언트가 여럿 붙어도 경고 안 뜨게

// Next.js dev 핫리로드에서 DB 인스턴스가 중복 생성되지 않도록 globalThis에 캐시한다.
const g = globalThis as unknown as { __flowDb?: Database.Database };

function getDb(): Database.Database {
  if (g.__flowDb) return g.__flowDb;

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "flow.db"));
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id    TEXT PRIMARY KEY,
      cwd           TEXT NOT NULL,
      project_name  TEXT NOT NULL,
      status        TEXT NOT NULL,
      stage         TEXT,
      just_did      TEXT,
      next_action   TEXT,
      blocker       TEXT,
      last_tool     TEXT,
      last_event    TEXT,
      last_event_at INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT NOT NULL,
      event_name   TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

    -- 프로젝트(폴더) 단위 사용자 설정. 별명은 루트 경로를 키로 저장.
    CREATE TABLE IF NOT EXISTS projects (
      root  TEXT PRIMARY KEY,
      alias TEXT
    );

    -- 진행 단계(트리): 매 턴 에이전트가 남긴 [flow] 한 줄 요약을 누적.
    CREATE TABLE IF NOT EXISTS steps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_steps_session ON steps(session_id);

    -- 사용자가 대시보드에서 보낸 요청(명령/선택). 영구 기록 → "내가 뭘 보냈는지" 추적용.
    CREATE TABLE IF NOT EXISTS sent_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sent_session ON sent_messages(session_id);
  `);

  // 마이그레이션: 기존 DB에 컬럼이 없으면 추가
  const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "source")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'claude'`);
  }
  if (!cols.some((c) => c.name === "session_title")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN session_title TEXT`);
  }
  if (!cols.some((c) => c.name === "last_activity")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_activity TEXT`);
  }
  if (!cols.some((c) => c.name === "project_root")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN project_root TEXT NOT NULL DEFAULT ''`);
    // 기존 행은 cwd로 루트 재계산해 백필
    const rows = db.prepare(`SELECT session_id, cwd FROM sessions`).all() as {
      session_id: string;
      cwd: string;
    }[];
    const upd = db.prepare(`UPDATE sessions SET project_root = ? WHERE session_id = ?`);
    for (const r of rows) upd.run(resolveProjectRoot(r.cwd), r.session_id);
  }

  if (!cols.some((c) => c.name === "tmux_pane")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN tmux_pane TEXT`);
  }
  if (!cols.some((c) => c.name === "next_options")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN next_options TEXT`);
  }
  if (!cols.some((c) => c.name === "pending_question")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN pending_question TEXT`);
  }
  if (!cols.some((c) => c.name === "last_stop_at")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_stop_at INTEGER`);
  }
  if (!cols.some((c) => c.name === "last_prompt_at")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_prompt_at INTEGER`);
  }
  if (!cols.some((c) => c.name === "stuck")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN stuck INTEGER`);
  }
  if (!cols.some((c) => c.name === "dead")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN dead INTEGER`);
  }
  if (!cols.some((c) => c.name === "error_reason")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN error_reason TEXT`);
  }
  if (!cols.some((c) => c.name === "session_alias")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN session_alias TEXT`);
  }
  if (!cols.some((c) => c.name === "tty")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN tty TEXT`);
  }
  if (!cols.some((c) => c.name === "iterm_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN iterm_id TEXT`);
  }
  if (!cols.some((c) => c.name === "recap")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN recap TEXT`);
  }
  if (!cols.some((c) => c.name === "transcript_path")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN transcript_path TEXT`);
  }

  // steps 테이블: request(요청 요약), 전체 질문/답변 컬럼 추가
  const stepCols = db.prepare(`PRAGMA table_info(steps)`).all() as { name: string }[];
  if (!stepCols.some((c) => c.name === "request")) {
    db.exec(`ALTER TABLE steps ADD COLUMN request TEXT`);
  }
  if (!stepCols.some((c) => c.name === "full_request")) {
    db.exec(`ALTER TABLE steps ADD COLUMN full_request TEXT`); // 그 턴의 전체 질문(원문)
  }
  if (!stepCols.some((c) => c.name === "full_answer")) {
    db.exec(`ALTER TABLE steps ADD COLUMN full_answer TEXT`); // 그 턴의 전체 답변(원문)
  }

  // sent_messages: 응답 완료 시각(래칭). 한 번 응답되면 이후 새 메시지로 last_prompt_at이
  // 바뀌어도 다시 "대기중"으로 부활하지 않게 영구 표시.
  const sentCols = db.prepare(`PRAGMA table_info(sent_messages)`).all() as { name: string }[];
  if (!sentCols.some((c) => c.name === "answered_at")) {
    db.exec(`ALTER TABLE sent_messages ADD COLUMN answered_at INTEGER`);
  }

  g.__flowDb = db;
  return db;
}

// 세션 조회 공통 SELECT: projects 테이블을 조인해 alias를 함께 가져온다.
const SESSION_SELECT = `SELECT s.*, p.alias FROM sessions s LEFT JOIN projects p ON p.root = s.project_root`;

// cwd → 프로젝트 루트 경로. cwd에서 위로 올라가며 .git을 찾고 그 폴더를 루트로 본다.
// (서브디렉토리에서 세션을 돌려도 같은 루트로 묶임) 결과는 cwd 기준 캐시.
const projectRootCache = new Map<string, string>();
function resolveProjectRoot(cwd: string): string {
  if (!cwd) return "";
  const cached = projectRootCache.get(cwd);
  if (cached) return cached;

  let dir = cwd;
  let result = cwd; // 폴백: cwd 자체
  while (dir && dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, ".git"))) {
      result = dir;
      break;
    }
    dir = path.dirname(dir);
  }
  projectRootCache.set(cwd, result);
  return result;
}

// Tier1 활동 요약: 원시 이벤트 + tool_input에서 "무엇을" 뽑아 사람이 읽을 한 줄로.
// null이면 의미 있는 활동이 아니므로 이전 값을 유지한다.
function describeActivity(
  eventName: string,
  payload: Record<string, unknown>,
): string | null {
  if (eventName === "PreToolUse" || eventName === "PostToolUse") {
    const tool = String(payload.tool_name ?? "");
    const ti = (payload.tool_input ?? {}) as Record<string, unknown>;
    if (tool === "Bash" && ti.command) {
      return `$ ${String(ti.command).replace(/\s+/g, " ").slice(0, 60)}`;
    }
    const file = ti.file_path ?? ti.path ?? ti.notebook_path;
    if (file) return `${tool} · ${path.basename(String(file))}`;
    if (ti.pattern) return `${tool} · ${String(ti.pattern).slice(0, 40)}`;
    return tool || null;
  }
  if (eventName === "UserPromptSubmit") return "사용자 지시 받음";
  if (eventName === "Notification") {
    const t = String(payload.type ?? "");
    if (t.includes("permission")) return "권한 승인 대기";
    if (t.includes("idle")) return "입력 대기";
    return null;
  }
  return null; // Stop/SessionEnd 등은 직전 활동을 유지
}

// transcript(JSONL)에서 마지막 assistant 메시지의 "[flow] 요청 → 결과" 줄을 추출한다.
// 화살표(→)로 요청/결과를 분리. 안 남겼으면 null (그땐 Tier1 활동으로 폴백).
function extractFlow(transcriptPath: string): {
  request: string | null;
  result: string;
  next: string[];
  fullRequest: string | null; // 그 턴의 전체 질문(원문)
  fullAnswer: string | null; // 그 턴의 전체 답변(원문, [flow] 메타줄 제외)
} | null {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    let lastText = "";
    let lastUserText = "";
    for (const line of lines) {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = (obj.message ?? obj) as Record<string, unknown>;
      const role = msg.role ?? obj.type;
      const content = msg.content;
      // 텍스트 블록만 모아 한 덩어리로
      const textOf = (): string => {
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          return content
            .filter((b) => b && (b as { type?: string }).type === "text")
            .map((b) => (b as { text?: string }).text ?? "")
            .join("\n");
        }
        return "";
      };
      if (role === "assistant") {
        const text = textOf();
        if (text) lastText = text;
      } else if (role === "user") {
        // 도구 결과(tool_result)만 있는 user 턴은 건너뛰고, 실제 입력 텍스트만 캡처
        let ut = textOf();
        // 훅이 주입한 [관제] 지시 + system-reminder 블록은 질문 표시에서 제거
        ut = ut
          .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
          .replace(/\[관제][\s\S]*?관제 대시보드가 읽는다\.?/g, "")
          .trim();
        if (ut) lastUserText = ut;
      }
    }
    // 줄 시작의 [flow] 인식(맨 마지막 것). 에이전트가 주입 형식을 그대로 따라
    // "요약: `[flow] …`" / "다음 옵션: `[flow-next] …`" 처럼 라벨·백틱을 앞에 붙여도 잡는다.
    const strip = (x: string) => x.replace(/^`+|`+$/g, "").trim();
    // 라벨(요약/다음 옵션/summary/next 등) + 콜론 + 백틱이 [flow] 앞에 올 수 있음
    const LABEL = String.raw`(?:(?:요약|다음\s*옵션|다음|summary|next)\s*[:：]\s*)?`;
    const flowRe = new RegExp(String.raw`^\s*` + LABEL + String.raw`\x60?\s*\[flow\]\s*(.+?)\s*\x60?\s*$`, "gim");
    const nextRe = new RegExp(String.raw`^\s*` + LABEL + String.raw`\x60?\s*\[flow-next\]\s*(.+?)\s*\x60?\s*$`, "gim");
    const matches = [...lastText.matchAll(flowRe)];
    if (matches.length === 0) return null;
    const body = strip(matches[matches.length - 1][1]);
    const parts = body.split(/\s*(?:→|->|=>)\s*/);
    const request = parts.length >= 2 ? strip(parts[0]) : null;
    const result = parts.length >= 2 ? strip(parts.slice(1).join(" → ")) : body;
    // 다음 작업 옵션: [flow-next] 옵션1 | 옵션2 | 옵션3
    const nextM = [...lastText.matchAll(nextRe)];
    const next = nextM.length
      ? strip(nextM[nextM.length - 1][1])
          .split(/\s*\|\s*/)
          .map((x) => strip(x))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    // 전체 답변: [flow]/[flow-next] 메타줄을 뺀 본문 (라벨 접두사 포함해 제거)
    const metaRe = new RegExp(String.raw`^\s*` + LABEL + String.raw`\x60?\s*\[flow(?:-next)?\]`, "i");
    const fullAnswer =
      lastText
        .split("\n")
        .filter((l) => !metaRe.test(l))
        .join("\n")
        .trim() || null;
    return { request, result, next, fullRequest: lastUserText || null, fullAnswer };
  } catch {
    return null;
  }
}

// transcript에서 Claude Code의 away_summary(세션 총정리=리캡)를 추출.
function extractRecap(transcriptPath: string): string | null {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    let recap: string | null = null;
    for (const line of lines) {
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (o.type === "system" && o.subtype === "away_summary" && typeof o.content === "string") {
        recap = o.content.trim();
      }
    }
    return recap;
  } catch {
    return null;
  }
}

// transcript 끝에서 마지막 턴의 에러 사유를 추출 (API rate limit 등).
function extractError(transcriptPath: string): string | null {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    // 뒤에서부터 가장 최근 에러 메시지를 찾는다 (후속 도구결과/시스템 줄이 많을 수 있어 넉넉히)
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 300); i--) {
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const msg = (o.message ?? {}) as Record<string, unknown>;
      const hasErr = "error" in o || "error" in msg || o.isApiErrorMessage === true;
      let text = "";
      const c = msg.content ?? o.content;
      if (typeof c === "string") text = c;
      else if (Array.isArray(c))
        text = c
          .filter((b) => b && (b as { type?: string }).type === "text")
          .map((b) => (b as { text?: string }).text ?? "")
          .join(" ");
      if ((hasErr || /API Error|rate limit|temporarily|overloaded/i.test(text)) && text.trim()) {
        return text.trim().slice(0, 300);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// events 테이블 정리: 세션당 최근 200개만 남기고, 14일보다 오래된 것도 삭제.
// getEvents는 최근 50개만 쓰므로 데이터 손실 없이 무한 증가를 막는다.
const EVENT_KEEP_PER_SESSION = 200;
const EVENT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
function maybePruneEvents(db: Database.Database, now: number): void {
  // 매번 돌면 비싸다 — 100건에 1번꼴로만(카운터 기반이라 결정적, Math.random 불필요).
  pruneCounter = (pruneCounter + 1) % 100;
  if (pruneCounter !== 0) return;
  try {
    db.prepare(`DELETE FROM events WHERE created_at < ?`).run(now - EVENT_MAX_AGE_MS);
    // 세션별 최근 N개 초과분 삭제
    db.prepare(
      `DELETE FROM events WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) AS rn
           FROM events
         ) WHERE rn > ?
       )`,
    ).run(EVENT_KEEP_PER_SESSION);
  } catch {
    /* 정리는 베스트에포트 — 실패해도 기록엔 지장 없음 */
  }
}
let pruneCounter = 0;

// hook이 보낸 원본 payload를 받아 events에 기록하고 sessions를 갱신한다 (자동층).
// 식별 불가(session_id 없음) 이벤트는 무시한다.
export function recordEvent(payload: Record<string, unknown>): SessionRow | null {
  const sessionId = String(payload.session_id ?? "").trim();
  if (!sessionId) return null;

  const eventName = String(payload.hook_event_name ?? "unknown");
  const cwd = String(payload.cwd ?? "");
  const projectRoot = resolveProjectRoot(cwd);
  const projectName = projectRoot ? path.basename(projectRoot) : "(unknown)";
  // session_title은 SessionStart 등에서 옴. 비어있으면 기존 값 유지.
  const newTitle =
    typeof payload.session_title === "string" && payload.session_title.trim()
      ? payload.session_title.trim()
      : null;
  const now = Date.now();
  const db = getDb();

  db.prepare(
    `INSERT INTO events (session_id, event_name, payload_json, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(sessionId, eventName, JSON.stringify(payload), now);

  // events GC: payload_json이 통짜라 무한 증가하면 DB가 수백 MB로 부푼다.
  // getEvents는 세션당 최근 50개만 조회하므로 오래된 건 안전하게 지운다.
  // 매 이벤트마다 돌면 비싸니 약 1% 확률로만 실행(better-sqlite3 동기라 부담은 순간).
  maybePruneEvents(db, now);

  const existing = db
    .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
    .get(sessionId) as SessionRow | undefined;

  // 상태 파생: null이면 이전 상태 유지(없으면 idle로 시작)
  const derived = deriveStatus(eventName, payload);
  let status: SessionStatus = derived ?? existing?.status ?? "idle";
  // 컴팩팅(압축) 중에 들어온 StopFailure는 턴 실패가 아니라 압축 정리 과정 → 에러로 잡지 않음
  if (eventName === "StopFailure" && existing?.status === "compacting") {
    status = "compacting";
  }

  // PreToolUse일 때 방금 만진 도구를 기록 (보조 표시용)
  const lastTool =
    eventName === "PreToolUse" || eventName === "PostToolUse"
      ? String(payload.tool_name ?? existing?.last_tool ?? "")
      : (existing?.last_tool ?? null);

  // 의미 있는 활동만 갱신, 없으면 직전 활동 유지
  const lastActivity = describeActivity(eventName, payload) ?? existing?.last_activity ?? null;

  // just_did([flow] 요약)는 Stop 이후 비동기로 채운다(아래 captureFlowDeferred). 여기선 보존만.
  const justDid = existing?.just_did ?? null;

  // tmux pane: SessionStart 훅이 실어 보냄. 있으면 갱신, 없으면 기존 유지.
  const tmuxPane =
    typeof payload.tmux_pane === "string" && payload.tmux_pane
      ? payload.tmux_pane
      : (existing?.tmux_pane ?? null);

  db.prepare(
    `INSERT INTO sessions
       (session_id, cwd, project_root, project_name, session_title, source, status, just_did, tmux_pane, last_tool, last_event, last_activity, last_event_at, created_at)
     VALUES (@session_id, @cwd, @project_root, @project_name, @session_title, @source, @status, @just_did, @tmux_pane, @last_tool, @last_event, @last_activity, @last_event_at, @created_at)
     ON CONFLICT(session_id) DO UPDATE SET
       cwd           = excluded.cwd,
       project_root  = excluded.project_root,
       project_name  = excluded.project_name,
       session_title = excluded.session_title,
       status        = excluded.status,
       just_did      = excluded.just_did,
       tmux_pane     = excluded.tmux_pane,
       last_tool     = excluded.last_tool,
       last_event    = excluded.last_event,
       last_activity = excluded.last_activity,
       last_event_at = excluded.last_event_at`,
  ).run({
    session_id: sessionId,
    cwd,
    project_root: projectRoot,
    project_name: projectName,
    session_title: newTitle ?? existing?.session_title ?? null, // 새 제목 있으면 갱신, 없으면 유지
    source: existing?.source ?? "claude", // 현재 단일 벤더
    status,
    just_did: justDid, // [flow] 요약 (현재 상태 한 줄)
    tmux_pane: tmuxPane,
    last_tool: lastTool,
    last_event: eventName,
    last_activity: lastActivity,
    last_event_at: now,
    created_at: existing?.created_at ?? now,
  });

  // 터미널 제어 핸들 캡처 (SessionStart 훅이 tty/iterm_id를 보냄)
  const ttyVal =
    typeof payload.tty === "string" && payload.tty.startsWith("/dev/") ? payload.tty : null;
  const itermId =
    typeof payload.iterm_id === "string" && payload.iterm_id ? payload.iterm_id : null;
  const tPath =
    typeof payload.transcript_path === "string" && payload.transcript_path
      ? payload.transcript_path
      : null;
  if (ttyVal || itermId || tPath) {
    // GUID/tty 충돌 방지: 이 세션이 새 iterm_id·tty를 가지면, 그 핸들을 쓰던 다른 세션에서
    // 먼저 떼어낸다. iTerm이 탭을 닫고 GUID/tty를 재사용하면 옛 세션에 남아 "엉뚱한 탭으로 명령이
    // 가는" 사고가 나므로, 핸들은 항상 최신 세션 하나만 소유하게 한다.
    if (itermId) {
      db.prepare(`UPDATE sessions SET iterm_id = NULL WHERE iterm_id = ? AND session_id != ?`).run(
        itermId,
        sessionId,
      );
    }
    if (ttyVal) {
      db.prepare(`UPDATE sessions SET tty = NULL WHERE tty = ? AND session_id != ?`).run(
        ttyVal,
        sessionId,
      );
    }
    db.prepare(
      `UPDATE sessions SET tty = COALESCE(?, tty), iterm_id = COALESCE(?, iterm_id), transcript_path = COALESCE(?, transcript_path) WHERE session_id = ?`,
    ).run(ttyVal, itermId, tPath, sessionId);
  }

  // 턴 종료(Stop) 시각 기록 — [flow] 없이도 "응답 왔다"를 판정하기 위함
  if (eventName === "Stop") {
    db.prepare(`UPDATE sessions SET last_stop_at = ? WHERE session_id = ?`).run(now, sessionId);
  }
  // 프롬프트 접수(UserPromptSubmit) 시각 — 내 메시지가 실제로 새 턴을 시작했는지 판정용
  if (eventName === "UserPromptSubmit") {
    db.prepare(`UPDATE sessions SET last_prompt_at = ? WHERE session_id = ?`).run(now, sessionId);
  }
  // 응답 완료 래칭: 턴 종료(Stop)가 오면, 접수(last_prompt_at)된 미응답 보낸메시지를
  // "응답됨"으로 영구 표시. 한 번 표시되면 이후 새 메시지로 last_prompt_at이 바뀌어도 부활 안 함.
  if (eventName === "Stop") {
    const p = db.prepare(`SELECT last_prompt_at FROM sessions WHERE session_id = ?`).get(sessionId) as
      | { last_prompt_at: number | null }
      | undefined;
    const prompt = p?.last_prompt_at;
    if (prompt != null) {
      db.prepare(
        `UPDATE sent_messages SET answered_at = ?
         WHERE session_id = ? AND answered_at IS NULL AND created_at <= ?`,
      ).run(now, sessionId, prompt);
    }
  }
  // 죽음(💀) 표시 자동 해제는 SessionStart(진짜 재시작)에서만 한다.
  // 모든 이벤트에서 풀면, 내가 kill한 직후 지연 도착한 trailing 이벤트(Stop 등)가
  // 죽은 세션을 되살려 카드가 깜빡이는 버그가 생긴다.
  if (existing?.dead && eventName === "SessionStart") {
    db.prepare(`UPDATE sessions SET dead = 0 WHERE session_id = ?`).run(sessionId);
  }

  // 에러 사유 캡처(에러 상태) / 복구 시 클리어(작업중·유휴)
  if (status === "error") {
    const reason = extractError(
      String(payload.transcript_path ?? existing?.transcript_path ?? ""),
    );
    db.prepare(`UPDATE sessions SET error_reason = ? WHERE session_id = ?`).run(
      reason ?? "턴 실패",
      sessionId,
    );
  } else if (
    (status === "working" || status === "idle" || status === "compacting") &&
    existing?.error_reason
  ) {
    db.prepare(`UPDATE sessions SET error_reason = NULL WHERE session_id = ?`).run(sessionId);
  }

  // AskUserQuestion 선택지 캡처(PreToolUse) / 해제(응답·턴종료 시)
  const toolName = String(payload.tool_name ?? "");
  if (eventName === "PreToolUse" && toolName === "AskUserQuestion") {
    const ti = payload.tool_input as
      | {
          questions?: Array<{
            question?: string;
            header?: string;
            options?: Array<{ label?: string; description?: string }>;
          }>;
        }
      | undefined;
    const qs = ti?.questions ?? [];
    if (qs.length > 0) {
      // 다중 질문 전부 보존(원본 그대로): 각 질문의 헤더+질문+옵션(라벨/설명).
      // 하위호환: 단일 질문은 {question, header, options}도 함께 둔다.
      const questions = qs.map((q) => ({
        question: q.question ?? "",
        header: q.header ?? "",
        options: (q.options ?? []).map((o) => ({
          label: o.label ?? "",
          description: o.description ?? "",
        })),
      }));
      db.prepare(`UPDATE sessions SET pending_question = ? WHERE session_id = ?`).run(
        JSON.stringify({ questions, ...questions[0] }),
        sessionId,
      );
    }
  } else if (
    (eventName === "PostToolUse" && toolName === "AskUserQuestion") ||
    eventName === "UserPromptSubmit" ||
    eventName === "Stop"
  ) {
    db.prepare(`UPDATE sessions SET pending_question = NULL WHERE session_id = ?`).run(sessionId);
  }

  const row = hydrate(
    db.prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(sessionId) as SessionRow,
  );

  bus.emit("update", row); // SSE 구독자에게 알림

  // [flow]·recap 캡처: 턴종료/입력/알림/세션종료 때 (recap은 자리비움 후 늦게 뜨므로 폭넓게)
  if (["Stop", "UserPromptSubmit", "Notification", "SessionEnd"].includes(eventName)) {
    captureTranscript(sessionId, String(payload.transcript_path ?? ""));
  }
  return row;
}

// transcript에서 [flow] 요약과 recap(away_summary)을 읽어 반영. flush 지연 대비 재시도.
// 마지막 assistant 메시지의 텍스트 블록만 모아 반환 (stuck 감지용)
function lastAssistantText(transcriptPath: string): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    let lastText = "";
    for (const line of lines) {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = (obj.message ?? obj) as Record<string, unknown>;
      if ((msg.role ?? obj.type) !== "assistant") continue;
      const content = msg.content;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content))
        text = content
          .filter((b) => b && (b as { type?: string }).type === "text")
          .map((b) => (b as { text?: string }).text ?? "")
          .join("\n");
      if (text) lastText = text;
    }
    return lastText;
  } catch {
    return "";
  }
}

// 도구 호출을 실제 실행하지 않고 마크업을 "텍스트로" 뱉은 흔적
const TOOL_LEAK_RE = /<\/?(?:antml:)?(?:invoke|function_calls)\b|<parameter\s+name=/i;
// 코드블록/인라인 코드 제거 — 백틱으로 "인용·설명한" 마크업은 누출이 아니므로 제외
function stripCode(t: string): string {
  return t.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
}

function captureTranscript(sessionId: string, transcriptPath: string, attempt = 0): void {
  if (!transcriptPath) return;
  const db = getDb();
  let changed = false;

  // [flow] 진행 요약 → 새 단계
  const flow = extractFlow(transcriptPath);

  // 멈춤(stuck) 감지:
  //  - [flow]가 잡히면 정상 → 해제(0)
  //  - [flow] 없이 도구호출 마크업(코드 인용 제외)이 retry 끝까지 지속되면 확정(1)
  //    → transcript flush 지연(레이스)로 인한 이른 오판을 막기 위해 충분히 기다린 뒤에만 켠다
  const curStuck = (
    db.prepare(`SELECT stuck FROM sessions WHERE session_id = ?`).get(sessionId) as
      | { stuck: number | null }
      | undefined
  )?.stuck;
  let stuck = curStuck ? 1 : 0;
  if (flow) {
    stuck = 0;
  } else if (attempt >= 8) {
    stuck = TOOL_LEAK_RE.test(stripCode(lastAssistantText(transcriptPath))) ? 1 : 0;
  }
  if ((curStuck ? 1 : 0) !== stuck) {
    db.prepare(`UPDATE sessions SET stuck = ? WHERE session_id = ?`).run(stuck, sessionId);
    changed = true;
  }
  if (flow) {
    const last = db
      .prepare(
        `SELECT id, text, full_answer FROM steps WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(sessionId) as { id: number; text: string; full_answer: string | null } | undefined;
    const nextJson = JSON.stringify(flow.next);

    // 옵션/현재상태는 항상 최신으로 (요약이 같아도 옵션·답변이 바뀌면 갱신)
    const cur = db
      .prepare(`SELECT just_did, next_options FROM sessions WHERE session_id = ?`)
      .get(sessionId) as { just_did: string | null; next_options: string | null } | undefined;
    if (cur?.just_did !== flow.result || cur?.next_options !== nextJson) {
      db.prepare(`UPDATE sessions SET just_did = ?, next_options = ? WHERE session_id = ?`).run(
        flow.result,
        nextJson,
        sessionId,
      );
      changed = true;
    }

    if (!last || last.text !== flow.result) {
      // 요약이 바뀜 → 새 진행 단계 추가
      db.prepare(
        `INSERT INTO steps (session_id, request, text, full_request, full_answer, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(sessionId, flow.request, flow.result, flow.fullRequest, flow.fullAnswer, Date.now());
      changed = true;
    } else if (flow.fullAnswer && last.full_answer !== flow.fullAnswer) {
      // 요약은 같지만 답변 내용이 바뀜(스트리밍/보강) → 마지막 단계 내용만 갱신.
      // created_at은 유지한다 — 올리면 오래된 step이 트리 맨 위로 튀어 시간순이 깨진다.
      db.prepare(
        `UPDATE steps SET full_request = ?, full_answer = ?, request = ? WHERE id = ?`,
      ).run(flow.fullRequest, flow.fullAnswer, flow.request, last.id);
      changed = true;
    }
  }

  // recap (away_summary) → session.recap
  const recap = extractRecap(transcriptPath);
  if (recap) {
    const cur = db.prepare(`SELECT recap FROM sessions WHERE session_id = ?`).get(sessionId) as
      | { recap: string | null }
      | undefined;
    if (!cur || cur.recap !== recap) {
      db.prepare(`UPDATE sessions SET recap = ? WHERE session_id = ?`).run(recap, sessionId);
      changed = true;
    }
  }

  if (changed) {
    const row = db.prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(sessionId) as
      | SessionRow
      | undefined;
    if (row) bus.emit("update", hydrate(row));
    return;
  }
  if (attempt < 10) {
    setTimeout(() => captureTranscript(sessionId, transcriptPath, attempt + 1), 900);
  }
}

// 의미층(MCP update_status)이 채우는 PM 필드. 자동층 status는 건드리지 않는다.
export function updateSemantic(
  sessionId: string,
  fields: { stage?: string; just_did?: string; next_action?: string; blocker?: string },
): SessionRow | null {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
    .get(sessionId) as SessionRow | undefined;
  if (!existing) return null;

  db.prepare(
    `UPDATE sessions SET
       stage       = COALESCE(@stage, stage),
       just_did    = COALESCE(@just_did, just_did),
       next_action = COALESCE(@next_action, next_action),
       blocker     = COALESCE(@blocker, blocker)
     WHERE session_id = @session_id`,
  ).run({
    session_id: sessionId,
    stage: fields.stage ?? null,
    just_did: fields.just_did ?? null,
    next_action: fields.next_action ?? null,
    blocker: fields.blocker ?? null,
  });

  const row = hydrate(
    db.prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(sessionId) as SessionRow,
  );
  bus.emit("update", row);
  return row;
}

// 프로젝트(폴더) 별명 저장. 같은 루트의 모든 세션 카드를 실시간 갱신.
export function setProjectAlias(root: string, alias: string): void {
  const db = getDb();
  const value = alias.trim() || null;
  db.prepare(
    `INSERT INTO projects (root, alias) VALUES (?, ?)
     ON CONFLICT(root) DO UPDATE SET alias = excluded.alias`,
  ).run(root, value);

  const affected = db
    .prepare(`${SESSION_SELECT} WHERE s.project_root = ?`)
    .all(root) as SessionRow[];
  for (const r of affected) bus.emit("update", hydrate(r));
}

// 세션을 죽음(💀)으로 표시 — 프로세스는 종료하되 목록엔 보존, 나중에 되살리기 위함.
export function markDead(sessionId: string): void {
  const db = getDb();
  db.prepare(`UPDATE sessions SET dead = 1 WHERE session_id = ?`).run(sessionId);
  const row = db.prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(sessionId) as
    | SessionRow
    | undefined;
  if (row) bus.emit("update", hydrate(row));
}

// 죽음 표시 해제 (되살리기). 실제 프로세스 재개는 /api/restore가 담당.
export function reviveSession(sessionId: string): void {
  const db = getDb();
  db.prepare(`UPDATE sessions SET dead = 0 WHERE session_id = ?`).run(sessionId);
  const row = db.prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(sessionId) as
    | SessionRow
    | undefined;
  if (row) bus.emit("update", hydrate(row));
}

// 세션 수동 삭제 (사용자가 명시적으로). 관련 steps/events도 정리하고 SSE로 제거 알림.
export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE session_id = ?`).run(sessionId);
  db.prepare(`DELETE FROM steps WHERE session_id = ?`).run(sessionId);
  db.prepare(`DELETE FROM sent_messages WHERE session_id = ?`).run(sessionId);
  db.prepare(`DELETE FROM events WHERE session_id = ?`).run(sessionId);
  bus.emit("delete", sessionId);
}

// 세션 개별 별명 저장.
export function setSessionAlias(sessionId: string, alias: string): void {
  const db = getDb();
  db.prepare(`UPDATE sessions SET session_alias = ? WHERE session_id = ?`).run(
    alias.trim() || null,
    sessionId,
  );
  const row = db.prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(sessionId) as
    | SessionRow
    | undefined;
  if (row) bus.emit("update", hydrate(row));
}

// 원본 이벤트 1행 (상세 타임라인용)
export interface EventRow {
  id: number;
  session_id: string;
  event_name: string;
  created_at: number;
}

// 세션 단건 조회 (상세 패널)
export function getSession(id: string): SessionRow | undefined {
  const row = getDb().prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(id) as
    | SessionRow
    | undefined;
  return row ? hydrate(row) : undefined;
}

// 진행 단계 1행 (트리용)
export interface StepRow {
  id: number;
  session_id: string;
  request: string | null; // 사용자가 요청한 것(요약)
  text: string; // 결과/한 일(요약)
  full_request: string | null; // 그 턴의 전체 질문(원문)
  full_answer: string | null; // 그 턴의 전체 답변(원문)
  created_at: number;
}

// 세션의 진행 단계 — 오래된 것부터(트리 순서)
export function getSteps(id: string): StepRow[] {
  return getDb()
    .prepare(`SELECT * FROM steps WHERE session_id = ? ORDER BY created_at ASC`)
    .all(id) as StepRow[];
}

// 최근 N개 진행 단계 (오래된→최신 순서로 반환). 카드 인라인 표시용.
export function getRecentSteps(id: string, limit = 5): StepRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM steps WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(id, limit) as StepRow[];
  return rows.reverse();
}

// 세션 row에 최근 단계 3개 + 내가 보낸 요청 3개를 부착 (조회/SSE 푸시 시)
function hydrate(row: SessionRow): SessionRow {
  return {
    ...row,
    recentSteps: getRecentSteps(row.session_id, 2),
    recentSent: getSentMessages(row.session_id, 3),
  };
}

// 사용자가 보낸 요청 1행
export interface SentRow {
  id: number;
  session_id: string;
  text: string;
  created_at: number;
  answered_at: number | null; // 응답 완료로 래칭된 시각 (null이면 대기중)
}

// 보낸 요청 기록 (영구). 저장 후 SSE로 즉시 카드 갱신.
export function recordSent(sessionId: string, text: string): void {
  const db = getDb();
  db.prepare(`INSERT INTO sent_messages (session_id, text, created_at) VALUES (?, ?, ?)`).run(
    sessionId,
    text.slice(0, 2000),
    Date.now(),
  );
  const row = db.prepare(`${SESSION_SELECT} WHERE s.session_id = ?`).get(sessionId) as
    | SessionRow
    | undefined;
  if (row) bus.emit("update", hydrate(row));
}

// 내가 보낸 최근 요청 (최신 → 과거)
export function getSentMessages(id: string, limit = 5): SentRow[] {
  return getDb()
    .prepare(`SELECT * FROM sent_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(id, limit) as SentRow[];
}

// 세션의 최근 이벤트 (타임라인). payload는 무거우니 제외.
export function getEvents(id: string, limit = 50): EventRow[] {
  return getDb()
    .prepare(
      `SELECT id, session_id, event_name, created_at FROM events
       WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(id, limit) as EventRow[];
}

// 대시보드 스냅샷: "나를 기다리는 세션(대기/에러)" 먼저, 그 안에서 최근 활동 순.
export function getSessions(): SessionRow[] {
  const rows = (getDb().prepare(SESSION_SELECT).all() as SessionRow[]).map(hydrate);
  return rows.sort(
    (a, b) =>
      STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] ||
      b.last_event_at - a.last_event_at,
  );
}
