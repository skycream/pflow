#!/bin/bash
# project_flow 관제판을 Safari에서 앞으로 띄우기 (없으면 새 탭으로 열기)
osascript <<'OSA'
tell application "Safari"
  activate
  set found to false
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "localhost:3000" then
        set current tab of w to t
        set index of w to 1
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  if not found then make new document with properties {URL:"http://localhost:3000/"}
end tell
tell application "System Events" to tell process "Safari" to set frontmost to true
OSA
