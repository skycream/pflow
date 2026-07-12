# project-flow — Claude Code 다중 세션 관제 대시보드

> **Mission-control dashboard for running many Claude Code sessions at once.**
> Monitor 8–10+ concurrent Claude Code sessions in one local web dashboard: see what each session just did, answer its questions with one click, inject prompts, run gated workflows, and revive dead sessions — without ever leaving the board.

여러 프로젝트에서 동시에 돌아가는 Claude Code 세션들을 **하나의 로컬 웹 대시보드**에서 PM처럼 통솔합니다. 각 세션이 방금 뭘 했는지, 지금 내 응답을 기다리는지 실시간으로 보고, 클릭 한 번으로 답하거나 프롬프트를 주입합니다.

## 주요 기능

- **실시간 관제판** — 모든 세션의 상태(작업중·대기·유휴·에러·압축중)를 SSE로 실시간 표시. 매 턴 `[flow]` 요약 한 줄과 다음 옵션 5개를 자동 수집
- **원클릭 응답** — Claude의 선택지 질문(AskUserQuestion)을 대시보드에서 버튼으로 답변(다중 질문·자유 텍스트 답변 지원). 미열람 응답은 형광 하이라이트
- **퀵 액션** — ▶️계속 · ⏩전부진행 · ⏹️중단 · ✅승인 · 🚢배포 · 🧹/clear · 🗜️/compact · 🤖모델변경 등을 iTerm에 직접 주입 (hover 시 주입될 프롬프트 미리보기)
- **게이트 워크플로우** — 스펙→설계→계획→슬라이스 구현→검증→배포를 승인 게이트와 함께 순차 자동 실행. "Unknowns 발견 흐름"(블라인드스팟→인터뷰→시안→계획→구현노트→퀴즈) 프리셋 내장
- **세션 생명주기 관리** — 죽은 세션 💀 표시·되살리기(`claude --resume`), 일괄 복구, 재접속(스킬 재로드), 오래된 세션 정리로 메모리 회수, 멈춤(stuck) 자동 교정
- **음성노트** — 녹음 전사본을 주제별로 정리해 대시보드에서 열람 (`data/voice-notes/`)
- **자동 재시도** — rate limit 등 일시 에러를 자동으로 재시도. OS 알림·탭 배지로 "내 차례" 알림

## 요구 사항

- **macOS** + **iTerm2** (AppleScript로 세션에 프롬프트를 주입합니다)
- **Claude Code** CLI
- Node.js 20+

## 설치

```bash
git clone <this-repo>
cd project-flow
npm install
npm run dev   # http://localhost:3000
```

### 1) 플러그인 설치 (이벤트 수집)

Claude Code에서 이 저장소를 마켓플레이스로 추가하고 플러그인을 설치합니다:

```
/plugin marketplace add /path/to/project-flow
/plugin install project-flow@flow-market
```

플러그인의 hooks가 각 세션의 이벤트(SessionStart/Stop/도구 사용 등)를 `localhost:3000/api/hook`으로 전송합니다.

> 플러그인 없이 특정 프로젝트만 연결하려면 `examples/claude-settings.sample.json`의 hooks 블록을 해당 프로젝트의 `.claude/settings.json`에 붙여넣어도 됩니다.

### 2) 세션 시작

iTerm2에서 아무 프로젝트 폴더로 이동해 `claude`를 실행하면, 대시보드 왼쪽 레일에 프로젝트와 세션이 자동으로 나타납니다.

### 3) (선택) 부팅 시 자동 시작

`launchd`로 대시보드를 상시 실행하려면 LaunchAgent를 등록하세요 (죽으면 자동 재시작):

```xml
<!-- ~/Library/LaunchAgents/com.projectflow.dashboard.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.projectflow.dashboard</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>/path/to/project-flow</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/npm</string><string>run</string><string>dev</string>
  </array>
</dict></plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.projectflow.dashboard.plist
```

## 동작 원리

```
┌─────────────┐  hooks(HTTP)   ┌──────────────────┐   SSE    ┌───────────┐
│ Claude Code  │ ─────────────▶ │  Next.js 서버     │ ───────▶ │ 대시보드   │
│ 세션들(iTerm) │                │  + SQLite(flow.db)│          │ (브라우저) │
└─────────────┘ ◀───────────── └──────────────────┘          └───────────┘
                 AppleScript 주입      ▲ transcript(JSONL) 파싱
```

- 각 세션의 **hooks**가 이벤트를 대시보드 서버로 전송 → SQLite에 상태 기록 → **SSE**로 브라우저에 실시간 반영
- 매 턴 응답 끝에 `[flow] 요청 → 결과` / `[flow-next] 옵션×5` 요약을 남기도록 **UserPromptSubmit 훅이 지시를 주입**하고, transcript(JSONL)에서 이를 파싱해 관제판에 표시
- 대시보드에서 보낸 답변/프롬프트는 **AppleScript**로 해당 iTerm 세션에 타이핑되어 실제 입력됩니다

## 데이터·프라이버시

모든 데이터는 로컬에만 저장됩니다 (`data/` — gitignore됨). 외부 전송 없음.

## License

MIT
