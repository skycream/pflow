# pflow — Mission Control for Claude Code Sessions

**English** | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh-CN.md)

> Run 8–10+ concurrent Claude Code sessions and control them all from one local web dashboard: see what each session just did, answer its questions with one click, inject prompts, run gated workflows, and revive dead sessions — without ever leaving the board.

![pflow dashboard](docs/screenshot.png)

## Features

- **Live mission control** — Real-time status of every session (working / waiting / idle / error / compacting) via SSE. Each turn auto-reports a one-line `[flow]` summary plus 5 next-step options
- **One-click answers** — Answer Claude's multiple-choice questions (AskUserQuestion) from the dashboard, including multi-question forms and free-text answers. Unread replies glow until you look
- **Quick actions** — ▶️ continue · ⏩ proceed-all · ⏹️ interrupt · ✅ approve · 🚢 ship · 🧹 /clear · 🗜️ /compact · 🤖 switch model — injected straight into the right iTerm session (hover any button to preview the exact prompt it sends)
- **Gated workflows** — Run spec → design → plan → vertical-slice implementation → verify → deploy with approval gates. Includes an "Unknowns discovery" preset (blindspot pass → interview → prototypes → plan → implementation notes → quiz)
- **Session lifecycle** — Dead sessions get a 💀 marker and one-click revive (`claude --resume`), bulk restore after reboot, in-place reconnect (reloads new skills), old-session cleanup to reclaim memory, and automatic stuck-turn correction
- **Voice notes** — Browse transcribed voice memos organized by topic (`data/voice-notes/`)
- **Auto-retry** — Transient errors (rate limits) retry automatically. OS notifications + tab badge when a session needs you

## Requirements

- **macOS** + **iTerm2** (prompts are injected via AppleScript)
- **Claude Code** CLI
- Node.js 20+

## Install

```bash
git clone https://github.com/skycream/pflow
cd pflow
npm install
npm run dev   # http://localhost:3000
```

### 1) Install the plugin (event collection)

In Claude Code, add this repo as a marketplace and install the plugin:

```
/plugin marketplace add /path/to/pflow
/plugin install project-flow@flow-market
```

The plugin's hooks send each session's events (SessionStart / Stop / tool use / …) to `localhost:3000/api/hook`.

> To wire up just one project without the plugin, paste the hooks block from `examples/claude-settings.sample.json` into that project's `.claude/settings.json`.

### 2) Start sessions

Open any project folder in iTerm2 and run `claude` — the project and session appear in the dashboard's left rail automatically.

### 3) (Optional) Start on boot

Register a LaunchAgent to keep the dashboard always running (auto-restarts if it dies):

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

## How it works

```
┌──────────────┐  hooks (HTTP)  ┌───────────────────┐   SSE    ┌───────────┐
│ Claude Code   │ ─────────────▶ │  Next.js server    │ ───────▶ │ Dashboard  │
│ sessions      │                │  + SQLite(flow.db) │          │ (browser)  │
└──────────────┘ ◀───────────── └───────────────────┘          └───────────┘
              AppleScript injection      ▲ transcript (JSONL) parsing
```

- Each session's **hooks** post events to the dashboard server → state recorded in SQLite → pushed to the browser via **SSE**
- A **UserPromptSubmit hook** instructs Claude to end every turn with `[flow] request → result` / `[flow-next] 5 options`, which are parsed from the transcript (JSONL) and shown on the board
- Answers/prompts you send from the dashboard are typed into the target iTerm session via **AppleScript**

## Data & privacy

Everything stays on your machine (`data/` — gitignored). Nothing is sent anywhere.

## License

MIT
