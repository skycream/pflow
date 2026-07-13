# pflow — AI のお守りは卒業。艦隊を指揮せよ。

[English](README.md) | [한국어](README.ko.md) | **日本語** | [中文](README.zh-CN.md)

Claude Code セッションが1つなら開発は速くなります。10個立ち上げたら？ **タブ地獄**の始まりです — ターミナルのタブを行き来し、20分も質問待ちで止まっていたセッションに後から気づき、どのセッションが何をしたのか見失う。

**pflow はその混沌を管制塔に変えます。** 全セッションを1つのボードでリアルタイムに — 今何をしたかを見て、質問にはワンクリックで答え、プロンプトを撃ち込み、承認ゲート付きワークフローを回し、再起動後は死んだセッションを丸ごと復活。ターミナルのタブにはもう触れません。

![pflow dashboard](docs/screenshot.png)

```bash
curl -fsSL https://raw.githubusercontent.com/skycream/pflow/main/install.sh | bash
```

*コマンド1行: iTerm2・Node を確認（なければ自動インストール）→ クローン → 依存関係 → 自動起動登録 → ダッシュボードを開く。*

## 主な機能

- **リアルタイム管制盤** — 全セッションの状態（作業中・待機・アイドル・エラー・圧縮中）を SSE でリアルタイム表示。毎ターン `[flow]` の1行サマリーと次の選択肢5つを自動収集
- **ワンクリック回答** — Claude の選択式質問（AskUserQuestion）にダッシュボードのボタンで回答（複数質問・自由テキスト対応）。未読の返答は蛍光ハイライト
- **クイックアクション** — ▶️続行 · ⏩全部進行 · ⏹️中断 · ✅承認 · 🚢デプロイ · 🧹/clear · 🗜️/compact · 🤖モデル変更 などを iTerm に直接注入（ホバーで注入されるプロンプトをプレビュー）
- **ゲート付きワークフロー** — 仕様→設計→計画→スライス実装→検証→デプロイを承認ゲート付きで順次自動実行。「Unknowns 発見フロー」プリセット内蔵
- **セッションのライフサイクル管理** — 死んだセッションは 💀 表示・ワンクリック復活（`claude --resume`）、再起動後の一括復元、その場で再接続（スキル再読込）、古いセッション整理でメモリ回収、スタック自動矯正
- **ボイスノート** — 音声メモの文字起こしをトピック別に整理して閲覧（`data/voice-notes/`）
- **自動リトライ** — レート制限などの一時エラーを自動再試行。OS 通知・タブバッジで「あなたの番」をお知らせ

## 動作要件

- **macOS** + **iTerm2**（AppleScript でセッションにプロンプトを注入します）
- **Claude Code** CLI
- Node.js 20+

## インストール

```bash
git clone https://github.com/skycream/pflow
cd pflow
npm install
npm run dev   # http://localhost:3000
```

### 1) プラグインのインストール（イベント収集）

Claude Code でこのリポジトリをマーケットプレイスとして追加し、プラグインをインストール:

```
/plugin marketplace add /path/to/pflow
/plugin install project-flow@flow-market
```

プラグインの hooks が各セッションのイベント（SessionStart / Stop / ツール使用など）を `localhost:3000/api/hook` に送信します。

> プラグインなしで特定プロジェクトだけ接続する場合は、`examples/claude-settings.sample.json` の hooks ブロックをそのプロジェクトの `.claude/settings.json` に貼り付けてください。

### 2) セッション開始

iTerm2 で任意のプロジェクトフォルダに移動して `claude` を実行すると、ダッシュボードの左レールにプロジェクトとセッションが自動的に表示されます。

### 3)（任意）起動時に自動開始

LaunchAgent を登録するとダッシュボードが常時起動します（落ちても自動再起動）:

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

## 仕組み

```
┌──────────────┐  hooks (HTTP)  ┌───────────────────┐   SSE    ┌───────────┐
│ Claude Code   │ ─────────────▶ │  Next.js サーバー   │ ───────▶ │ ダッシュボード│
│ セッション群    │                │  + SQLite(flow.db) │          │ (ブラウザ)  │
└──────────────┘ ◀───────────── └───────────────────┘          └───────────┘
              AppleScript 注入        ▲ transcript (JSONL) 解析
```

- 各セッションの **hooks** がイベントをサーバーへ送信 → SQLite に状態を記録 → **SSE** でブラウザにリアルタイム反映
- **UserPromptSubmit フック**が毎ターン `[flow] リクエスト → 結果` / `[flow-next] 選択肢×5` を残すよう指示を注入し、transcript（JSONL）から解析して管制盤に表示
- ダッシュボードから送った回答/プロンプトは **AppleScript** で対象の iTerm セッションに入力されます

## データとプライバシー

すべてのデータはローカルにのみ保存されます（`data/` — gitignore 済み）。外部送信はありません。

## License

MIT
