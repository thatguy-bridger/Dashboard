#!/bin/bash
# Builds CalendarSync.app (a tiny app bundle, so macOS can grant it Calendar access under its own name).
set -euo pipefail
cd "$(dirname "$0")"
APP="build/CalendarSync.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.homebase.calendarsync</string>
  <key>CFBundleName</key><string>Home Base Calendar Sync</string>
  <key>CFBundleExecutable</key><string>CalendarSync</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSCalendarsUsageDescription</key><string>Shows your calendar events on your Home Base dashboard.</string>
  <key>NSCalendarsFullAccessUsageDescription</key><string>Shows your calendar events on your Home Base dashboard.</string>
</dict></plist>
PLIST
swiftc -O -target "$(uname -m)-apple-macos13.0" CalendarSync.swift -o "$APP/Contents/MacOS/CalendarSync"
codesign --force --sign - "$APP"
echo "built $APP"
