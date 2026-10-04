#!/bin/bash
# Installs the Calendar Sync as a per-user background job (every 15 minutes).
# Usage:  tools/calendar-sync/install.sh            (reads NOTIFY_TOKEN from .env.local)
#         tools/calendar-sync/install.sh <url> <token>
# Remove with:  tools/calendar-sync/uninstall.sh
set -euo pipefail
cd "$(dirname "$0")"

URL="${1:-https://dashboard.bridgerjones.com}"
TOKEN="${2:-$(grep '^NOTIFY_TOKEN=' ../../.env.local | cut -d= -f2-)}"
[ -n "$TOKEN" ] || { echo "No token: pass one or set NOTIFY_TOKEN in .env.local"; exit 1; }

./build.sh
DEST="$HOME/Library/Application Support/HomeBase"
mkdir -p "$DEST" "$HOME/.config/homebase"
rm -rf "$DEST/CalendarSync.app"
cp -R build/CalendarSync.app "$DEST/CalendarSync.app"

umask 077
printf '{"url":"%s","token":"%s"}\n' "$URL" "$TOKEN" > "$HOME/.config/homebase/calendar.json"

PLIST="$HOME/Library/LaunchAgents/com.homebase.calendarsync.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.homebase.calendarsync</string>
  <key>ProgramArguments</key><array><string>$DEST/CalendarSync.app/Contents/MacOS/CalendarSync</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>900</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/homebase-calendar-sync.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/homebase-calendar-sync.log</string>
</dict></plist>
PL

launchctl bootout "gui/$(id -u)/com.homebase.calendarsync" 2>/dev/null || true
# First run goes through the app bundle so macOS asks for Calendar access in the app's own name.
open -W "$DEST/CalendarSync.app" || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Syncs every 15 min. Log: ~/Library/Logs/homebase-calendar-sync.log"
