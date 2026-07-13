# pflow — Claude Code 多会话指挥中心

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | **中文**

> 同时运行 8–10+ 个 Claude Code 会话，在一个本地 Web 仪表盘中统一指挥：实时查看每个会话刚做了什么、是否在等你回复，一键作答、注入提示词、运行带审批门的工作流、复活已死会话 — 全程无需离开指挥板。

![pflow dashboard](docs/screenshot.png)

## 功能亮点

- **实时指挥板** — 通过 SSE 实时显示所有会话状态（工作中/等待/空闲/错误/压缩中）。每轮自动收集一行 `[flow]` 摘要和 5 个下一步选项
- **一键作答** — 在仪表盘上直接回答 Claude 的选择题（AskUserQuestion），支持多问题表单和自由文本回答。未读回复会高亮呼吸提醒
- **快捷操作** — ▶️继续 · ⏩全部推进 · ⏹️中断 · ✅批准 · 🚢部署 · 🧹/clear · 🗜️/compact · 🤖切换模型 — 直接注入对应 iTerm 会话（悬停按钮可预览将注入的完整提示词）
- **带门禁的工作流** — 规格→设计→计划→垂直切片实现→验证→部署，每个关键节点等待你的审批。内置 "Unknowns 发现流程" 预设（盲点扫描→访谈→原型→计划→实现笔记→测验）
- **会话生命周期管理** — 死亡会话标记 💀 并可一键复活（`claude --resume`）、重启后批量恢复、原地重连（重新加载技能）、清理旧会话回收内存、卡住自动纠正
- **语音笔记** — 按主题浏览语音备忘录的转录整理（`data/voice-notes/`）
- **自动重试** — 速率限制等临时错误自动重试。系统通知 + 标签徽章提醒"该你了"

## 环境要求

- **macOS** + **iTerm2**（通过 AppleScript 向会话注入提示词）
- **Claude Code** CLI
- Node.js 20+

## 安装

```bash
git clone https://github.com/skycream/pflow
cd pflow
npm install
npm run dev   # http://localhost:3000
```

### 1) 安装插件（事件收集）

在 Claude Code 中将本仓库添加为 marketplace 并安装插件：

```
/plugin marketplace add /path/to/pflow
/plugin install project-flow@flow-market
```

插件的 hooks 会将每个会话的事件（SessionStart / Stop / 工具调用等）发送到 `localhost:3000/api/hook`。

> 若只想连接单个项目而不装插件，可将 `examples/claude-settings.sample.json` 中的 hooks 块粘贴到该项目的 `.claude/settings.json`。

### 2) 启动会话

在 iTerm2 中进入任意项目文件夹运行 `claude`，项目和会话会自动出现在仪表盘左栏。

### 3)（可选）开机自启

注册 LaunchAgent 让仪表盘常驻运行（崩溃自动重启）：

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

## 工作原理

```
┌──────────────┐  hooks (HTTP)  ┌───────────────────┐   SSE    ┌───────────┐
│ Claude Code   │ ─────────────▶ │  Next.js 服务器     │ ───────▶ │  仪表盘    │
│  会话集群      │                │  + SQLite(flow.db) │          │ (浏览器)   │
└──────────────┘ ◀───────────── └───────────────────┘          └───────────┘
              AppleScript 注入        ▲ transcript (JSONL) 解析
```

- 各会话的 **hooks** 将事件发送到服务器 → 状态记入 SQLite → 通过 **SSE** 实时推送到浏览器
- **UserPromptSubmit 钩子**指示 Claude 每轮结尾输出 `[flow] 请求 → 结果` / `[flow-next] 5 个选项`，从 transcript（JSONL）解析后显示在指挥板上
- 你在仪表盘发送的回答/提示词通过 **AppleScript** 输入到目标 iTerm 会话

## 数据与隐私

所有数据仅保存在本机（`data/` — 已 gitignore）。不向任何外部发送。

## License

MIT
