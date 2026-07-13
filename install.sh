#!/bin/bash
# pflow 원라이너 설치 스크립트
#   curl -fsSL https://raw.githubusercontent.com/skycream/pflow/main/install.sh | bash
# 하는 일: 필수 도구 확인(iTerm2 없으면 자동 설치) → 클론 → 의존성 설치
#          → launchd 등록(부팅 시 자동 시작·죽으면 재시작) → 대시보드 오픈
set -e

PFLOW_DIR="${PFLOW_DIR:-$HOME/pflow}"
REPO="https://github.com/skycream/pflow"
LABEL="com.projectflow.dashboard"

say()  { printf "\033[1;32m▶ %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$1"; }
die()  { printf "\033[1;31m✖ %s\033[0m\n" "$1"; exit 1; }

# 0) macOS 확인
[ "$(uname)" = "Darwin" ] || die "pflow는 macOS 전용입니다 (iTerm2 + AppleScript 필요)."

# 1) Homebrew
if ! command -v brew >/dev/null 2>&1; then
  die "Homebrew가 필요합니다. 먼저 설치해주세요: https://brew.sh"
fi

# 2) iTerm2 — 없으면 자동 설치
if [ ! -d "/Applications/iTerm.app" ] && [ ! -d "$HOME/Applications/iTerm.app" ]; then
  say "iTerm2가 없어 자동 설치합니다..."
  brew install --cask iterm2 || die "iTerm2 설치 실패 — 수동 설치: https://iterm2.com"
else
  say "iTerm2 확인됨"
fi

# 3) Node 20+ — 없거나 낮으면 자동 설치
NODE_OK=false
if command -v node >/dev/null 2>&1; then
  MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  [ "$MAJOR" -ge 20 ] && NODE_OK=true
fi
if [ "$NODE_OK" = false ]; then
  say "Node.js 20+가 없어 자동 설치합니다..."
  brew install node || die "Node 설치 실패"
fi
say "Node $(node -v) 확인됨"

# 4) Claude Code CLI 확인 (없으면 안내만)
if ! command -v claude >/dev/null 2>&1; then
  warn "Claude Code CLI가 없습니다. 설치: npm install -g @anthropic-ai/claude-code"
fi

# 5) 클론 (이미 있으면 갱신)
if [ -d "$PFLOW_DIR/.git" ]; then
  say "기존 설치 발견 — 최신으로 갱신"
  git -C "$PFLOW_DIR" pull --ff-only || warn "갱신 실패(로컬 변경?) — 계속 진행"
else
  say "pflow 클론 → $PFLOW_DIR"
  git clone "$REPO" "$PFLOW_DIR"
fi

# 6) 의존성 설치
say "의존성 설치 (npm install)..."
cd "$PFLOW_DIR" && npm install --no-fund --no-audit

# 7) launchd 등록 — 부팅 시 자동 시작 + 죽으면 자동 재시작
say "launchd 등록 (자동 시작·자동 재시작)"
NPM_BIN=$(command -v npm)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" << PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>$PFLOW_DIR</string>
  <key>ProgramArguments</key><array>
    <string>$NPM_BIN</string><string>run</string><string>dev</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key><string>/tmp/pflow.log</string>
  <key>StandardErrorPath</key><string>/tmp/pflow.err.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# 8) 기동 확인 후 브라우저 오픈
say "대시보드 기동 대기..."
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/ 2>/dev/null | grep -q 200; then
    say "대시보드 실행 중 → http://localhost:3000"
    open "http://localhost:3000"
    break
  fi
  [ "$i" = 30 ] && warn "30초 내 미응답 — 로그 확인: tail /tmp/pflow.err.log"
done

echo ""
say "설치 완료! 마지막 한 단계만 남았습니다:"
echo ""
echo "  Claude Code 세션에서 아래 두 명령을 실행하세요 (이벤트 수집 플러그인):"
echo ""
echo "    /plugin marketplace add $PFLOW_DIR"
echo "    /plugin install project-flow@flow-market"
echo ""
echo "  그 후 iTerm2에서 프로젝트 폴더로 가서 claude 를 켜면 대시보드에 나타납니다."
