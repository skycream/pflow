# pflow — AI 돌보미는 그만. 함대를 지휘하세요.

[English](README.md) | **한국어** | [日本語](README.ja.md) | [中文](README.zh-CN.md)

Claude Code 세션 하나면 개발이 빨라집니다. 열 개를 띄우면? **탭 지옥**이 시작됩니다 — 터미널 탭을 오가며, 20분째 질문 하나에 멈춰 있던 세션을 뒤늦게 발견하고, 어느 세션이 뭘 했는지 놓치기 일쑤죠.

**pflow는 그 혼돈을 관제탑으로 바꿉니다.** 모든 세션을 한 화면에서 실시간으로 — 방금 뭘 했는지 보고, 질문엔 클릭 한 번으로 답하고, 프롬프트를 쏘고, 승인 게이트 워크플로우를 돌리고, 재부팅 후엔 죽은 세션을 통째로 되살립니다. 터미널 탭은 더 이상 안 만져도 됩니다.

![pflow dashboard](docs/screenshot.png)

```bash
curl -fsSL https://raw.githubusercontent.com/skycream/pflow/main/install.sh | bash
```

*명령 한 줄: iTerm2·Node 확인(없으면 자동 설치) → 클론 → 의존성 설치 → 자동시작 등록 → 대시보드 오픈.*

## 주요 기능

- **실시간 관제판** — 모든 세션의 상태(작업중·대기·유휴·에러·압축중)를 SSE로 실시간 표시. 매 턴 `[flow]` 요약 한 줄과 다음 옵션 5개를 자동 수집
- **원클릭 응답** — Claude의 선택지 질문(AskUserQuestion)을 대시보드에서 버튼으로 답변(다중 질문·자유 텍스트 답변 지원). 미열람 응답은 형광 하이라이트
- **퀵 액션** — ▶️계속 · ⏩전부진행 · ⏹️중단 · ✅승인 · 🚢배포 · 🧹/clear · 🗜️/compact · 🤖모델변경 등을 iTerm에 직접 주입 (hover 시 주입될 프롬프트 미리보기)
- **게이트 워크플로우** — 스펙→설계→계획→슬라이스 구현→검증→배포를 승인 게이트와 함께 순차 자동 실행. "Unknowns 발견 흐름"(블라인드스팟→인터뷰→시안→계획→구현노트→퀴즈) 프리셋 내장
- **세션 생명주기 관리** — 죽은 세션 💀 표시·되살리기(`claude --resume`), 일괄 복구, 재접속(스킬 재로드), 오래된 세션 정리로 메모리 회수, 멈춤(stuck) 자동 교정
- **음성노트** — 녹음 전사본을 주제별로 정리해 대시보드에서 열람 (`data/voice-notes/`)
- **자동 재시도** — rate limit 등 일시 에러를 자동으로 재시도. OS 알림·탭 배지로 "내 차례" 알림

## 기능 투어

### 🗼 한 화면에 모든 세션
![관제판](docs/feature-board.png)
왼쪽 레일에 모든 프로젝트·세션이 실시간 상태 점(작업중/대기/유휴/에러)과 함께. 헤더 칩으로 함대 전체 현황을 한눈에. 오른쪽엔 선택한 세션의 요청·답변·질문 전체. **"7번 세션 지금 뭐 하고 있지?"라는 궁금증이 사라집니다.**

### 🚦 레일이 알려주는 "내가 필요한 곳"
![레일](docs/feature-rail.png)
안 읽은 응답은 **형광으로 숨쉬고**, 🔀는 선택지 결정을 기다리는 세션. 죽은 세션은 조용히 사라지는 대신 💀(취소선)로 남아 — **아무것도 잊히지 않습니다.**

### ❓ 터미널 없이 Claude의 질문에 답하기
![질문 답변](docs/feature-question.png)
Claude가 선택지 질문(AskUserQuestion)을 던지면 옵션이 설명과 함께 버튼으로 떠요. 클릭 한 번으로 답. 다중 질문도 지원하고, 원하는 답이 없으면 **그 자리에서 자유 텍스트로 입력**.

### ⚡ 원클릭 액션 — 주입될 프롬프트까지 투명하게
![퀵 액션](docs/feature-hint.png)
계속·전부진행·중단·승인·배포·/clear·/compact·모델변경·PRD·디자인시스템·유저테스트… **버튼에 커서만 올리면 실제 주입될 프롬프트 전문이 미리 보입니다**("입력될 프롬프트 ▸" 바) — 숨은 마법 없음.

### 🔁 게이트 워크플로우 — 체크포인트 있는 자동조종
![워크플로우](docs/feature-workflow.png)
단계들이 순서대로 자동 실행되고, ✋게이트에서 승인을 기다리고, 🔁루프는 슬라이스마다 반복. 내장 **Unknowns 발견 흐름**(블라인드스팟→인터뷰→시안→계획→구현노트→퀴즈)이 최신 베스트프랙티스를 버튼 하나로.

### 💀 세션은 죽어도 대화는 죽지 않는다
![되살리기](docs/feature-revive.png)
터미널을 닫았거나 재부팅했어도, 죽은 세션은 💀로 자리를 지킵니다. 클릭 한 번(또는 그냥 메시지 전송)이면 `claude --resume`으로 대화가 그대로 되살아나고, 재부팅 후엔 일괄 복구로 함대 전체가 돌아옵니다.

### 📼 음성 메모도 정리해서
![음성노트](docs/feature-notes.png)
전사된 음성 메모를 `data/voice-notes/`에 넣으면 탭으로 열람 — 두서없는 말에서 추출한 바로 쓸 프롬프트와 함께.

## 요구 사항

- **macOS** + **iTerm2** (AppleScript로 세션에 프롬프트를 주입합니다)
- **Claude Code** CLI
- Node.js 20+

## 설치

**원라이너 (추천):**

```bash
curl -fsSL https://raw.githubusercontent.com/skycream/pflow/main/install.sh | bash
```

iTerm2·Node 20+를 확인하고(없으면 자동 설치), `~/pflow`에 클론, 의존성 설치, LaunchAgent 등록(부팅 시 자동 시작·죽으면 재시작), 대시보드 오픈까지 한 번에 끝냅니다.

<details>
<summary>수동 설치</summary>

```bash
git clone https://github.com/skycream/pflow
cd pflow
npm install
npm run dev   # http://localhost:3000
```

</details>

### 1) 플러그인 설치 (이벤트 수집)

Claude Code에서 이 저장소를 마켓플레이스로 추가하고 플러그인을 설치합니다:

```
/plugin marketplace add /path/to/pflow
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
  <key>WorkingDirectory</key><string>/path/to/pflow</string>
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
