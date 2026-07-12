# project_flow — 구현 계획서

> 여러 Claude Code 세션을 PM처럼 한눈에 통솔하는 **로컬 관제 대시보드**.
> 기존 도구가 못 채우는 빈틈: **무침습(기존 세션 그대로 흡수) + 내가 정의한 "단계/다음 할 일" PM 보드**.

---

## 0. 결정 사항 (확정)

- **목적**: 개인용 로컬 툴 우선 (인증·멀티테넌시·배포 전부 스킵). 가치 증명 후 제품화 재검토.
- **시작점**: 제로부터 직접 구현.
- **벤더 범위**: Claude Code **하나만** 먼저. (Codex/Cursor 멀티벤더는 어댑터 함정 → 나중)
- **수집 구조 (2층)**:
  - 자동층: Claude Code Hooks → 로컬 HTTP로 이벤트 POST (에이전트 협조 불필요)
  - 의미층: 커스텀 MCP 툴 `update_status(stage, just_did, next_action, blocker)` (단계/다음할일 = 우리 차별점)
- **스택**: Next.js(App Router) + SQLite(better-sqlite3) + shadcn/ui + Tailwind. MCP 서버는 별도 작은 TS 프로세스(@modelcontextprotocol/sdk, stdio).

## ✅ 진행 현황 (2026-06-18)
- [x] Stage 0.5 — 공식 문서로 hook 계약 검증 완료. `http` hook 타입 지원 확인, 모든 이벤트가 `session_id`/`cwd`/`transcript_path` 제공.
- [x] Stage 1 — Next.js 스캐폴드 + SQLite + `POST /api/hook` + 상태 머신 + 샘플 hook 설정. **가짜 세션 2개로 idle/waiting 파생 검증 통과.**
- [x] Stage 4.5(앞당김) — `plugin/` 디렉토리로 **project-flow 플러그인 v0.1(hook층)** 패키징. `claude plugin validate` 통과. **실제 claude 세션(`--plugin-dir`)으로 http hook → 대시보드 수집까지 end-to-end 검증 완료.** (MCP는 Stage 4에서 같은 플러그인에 추가 예정)
- [x] 디자인 단계 — `DESIGN.md` (IA·와이어프레임·비주얼). 보드 축 = **프로젝트 그리드**, 정렬 = 대기 먼저, 비주얼 = Linear풍 다크.
- [x] Stage 2 — `GET /api/sessions`(대기 먼저 정렬) + `GET /api/stream`(SSE) + `source` 컬럼(멀티벤더 대비). **SSE 라이브 푸시 검증 통과.**
- [x] Stage 3 — 보드 UI(`page.tsx` + `SessionCard`) + 요약 헤더 + 빈 상태. 렌더 200, 컴파일 에러 없음.
- [x] 배포/설치 (진짜 제품 흐름) — `.claude-plugin/marketplace.json`(flow-market)으로 레포를 마켓플레이스화. `claude plugin marketplace add` + `claude plugin install project-flow@flow-market`로 **일반 유저처럼 설치**. **`--plugin-dir` 없이 실제 세션이 자동 보고되는 것 검증 완료** = hook 자동 연결.
- [x] 이름: 프로젝트 루트(.git) 폴더명 + `session_title` 부제목. 대비 강화(좌측 색 바, 흰 제목, 상태 칩).
- [ ] Stage 4 — MCP 의미층(`update_status`로 단계/다음할일 채우기) → 플러그인 `.mcp.json`에 합치고 버전업+`claude plugin update`. **(다음 차례 — 이게 채워져야 카드의 '단계/다음/방금'이 진짜 PM 정보)**
- [x] 상세 패널 — 카드 클릭 → 세션ID·경로·이벤트 타임라인 + **재접속 명령**(`cd <cwd> && claude --resume <id>`) 복사. 튕긴 세션 복구.
- [x] 프로젝트 별명 — 폴더(루트) 단위 별명 저장(`projects` 테이블). 카드에 `별명 / 폴더명`. 상세 패널에서 입력.
- [x] 의미 요약 Tier 1 — `last_activity`: tool_input에서 "무엇을" 추출(`Edit · Post.tsx`, `$ npm run dev`). 키 불필요.
- [x] **의미 요약 Tier 2 — 에이전트 자가요약 방식 (키 불필요!)** — 서버가 `UserPromptSubmit` hook 응답으로 "맨 끝에 `[flow] 한줄요약` 남겨라" 주입(additionalContext) → `Stop` 후 지연 재시도로 transcript에서 `[flow]` 줄 추출 → `just_did` + `steps`(진행 트리)에 누적 → SSE 푸시. **실세션 검증 완료.** 모델/API 호출 0.
- [x] **진행 과정 트리** — 상세 패널에 매 턴 [flow] 요약 누적 타임라인(트리) 렌더.
- [x] **라이트/다크 + 토글** — 기본 라이트, 우측 상단 토글(localStorage 저장). 클래스 기반 dark variant.
- [ ] (옵션) Haiku 보강 — 에이전트가 [flow]를 안 남긴 세션용 모델 요약 폴백. ANTHROPIC_API_KEY 필요 시.
- [ ] **서버 러닝 추적 (큐)** — 세션이 띄운 localhost 서버 포트/주소 감지 → health check로 켜짐(초록)/꺼짐(빨강).
- [ ] Stage 5 — 다듬기: shadcn/ui, 갱신 하이라이트 모션, stale 처리 등.

## 0.5. ⚠️ 착수 전 필수 검증 (1순위 작업) — 완료됨

리서치 중 Hooks 세부(예: `http` 네이티브 hook 타입, 확장 이벤트명)에 **환각 의심분이 섞여 있었음.** 코드 짜기 전에 **설치된 실제 Claude Code 버전의 공식 hooks 문서**로 아래를 확정한다:
- 지원되는 hook 이벤트명 (확실한 코어: `SessionStart` `UserPromptSubmit` `PreToolUse` `PostToolUse` `Stop` `Notification` `SessionEnd`)
- 각 이벤트 stdin JSON에 `session_id` · `cwd` · `transcript_path`가 실제로 들어오는지
- hook `command` 타입에서 `curl` POST가 되는지 (이게 안전한 코어. `http` 타입은 있으면 보너스)
- → `command` + `jq`로 stdin 파싱 후 curl 방식을 기본으로 설계 (가장 호환성 높음)

## 1. 상태 모델 (스키마)

```
sessions
  session_id      TEXT   -- hook이 주는 ID
  cwd             TEXT   -- 프로젝트 경로 (식별 키: session_id + cwd)
  project_name    TEXT   -- cwd 베이스네임 (표시용)
  status          TEXT   -- working | waiting | idle | error  (자동층이 파생)
  stage           TEXT   -- 발견|기획|디자인|개발|테스트|배포  (의미층 update_status)
  just_did        TEXT   -- 방금 한 일       (의미층)
  next_action     TEXT   -- 다음 할 일       (의미층)
  blocker         TEXT   -- 막힌 점          (의미층)
  last_event_at   INTEGER
  last_tool       TEXT   -- 방금 만진 도구 (자동층 보조 표시)

events  -- (선택) 원본 이벤트 로그, 디버그/타임라인용
  id, session_id, event_name, payload_json, created_at
```

상태 머신 (자동층):
- `UserPromptSubmit` → working
- `PreToolUse` → working (last_tool 갱신)
- `Stop` → idle (턴 종료)
- `Notification(idle/permission)` → waiting (입력/권한 대기)
- `StopFailure`/에러 → error
- N초 이상 무이벤트 → stale 표시

## 2. 구현 단계 (각 단계 = 동작하는 산출물)

### Stage 1 — 수집 파이프라인 (이벤트가 실제로 꽂히는가)
- [ ] Next.js 프로젝트 스캐폴드 + SQLite 초기화
- [ ] `POST /api/hook` 엔드포인트: hook JSON 받아 events에 저장 + sessions upsert
- [ ] 샘플 `.claude/settings.json` hook 설정 생성 (command+curl)
- [ ] 검증: 실제 claude 세션 하나 돌려 이벤트가 DB에 쌓이는지 확인

### Stage 2 — 상태 파생 + 실시간 API
- [ ] 이벤트 → status 상태 머신 적용
- [ ] `GET /api/sessions` (현재 스냅샷)
- [ ] `GET /api/stream` SSE (이벤트 들어올 때 푸시)

### Stage 3 — 대시보드 보드 UI (전광판)
- [ ] shadcn/ui 카드 = 세션 1개 (status 색상 신호등)
- [ ] 보드 레이아웃 (status 또는 stage 컬럼)
- [ ] SSE 구독해 실시간 갱신
- [ ] "waiting" 세션 시각 강조 (입력 대기 콕 집기)

### Stage 4 — 의미층 MCP (차별점)
- [ ] MCP 서버: `update_status(stage, just_did, next_action, blocker)` 툴
- [ ] 호출 시 `POST /api/status` → sessions 갱신
- [ ] 보드에 stage 컬럼 + 방금한일/다음할일/막힌점 표시
- [ ] 각 프로젝트 CLAUDE.md에 "단계 바뀌면 update_status 호출" 가이드 추가

### Stage 5 — 다듬기 (선택)
- [ ] 미학 패스: 문서 2 툴킷(Linear/Stripe 참조, 클리셰 회피) 적용
- [ ] Playwright MCP로 시각 검증 루프
- [ ] stale/error 알림, 타임라인 뷰

## 3. MVP 경계 (안 할 것 = "오래 안 걸리게" 하는 핵심)
- ❌ 인증/로그인, 멀티유저, 클라우드 배포
- ❌ Codex/Cursor 멀티벤더 어댑터
- ❌ 태스크 재배분/능동 제어 (관제 = 보기 우선, 조작은 나중)
- ❌ 비용/토큰 분석 (Agent-Monitor류가 이미 함, 나중에)

## 4. 참고 (선행 리서치 결론)
- 빈 니치 아님: 공식 Agent View·Omnara·Conductor·Claude-Code-Agent-Monitor 등 존재.
- 우리만의 빈틈 = **무침습 + 내가 정의한 단계/다음할일 보드**. 여기에만 집중.
- 프론트엔드 보강 툴: shadcn/ui(+Base UI), MagicUI(`@magicuidesign/mcp`), tweakcn, 21st.dev Magic MCP, Playwright MCP.
