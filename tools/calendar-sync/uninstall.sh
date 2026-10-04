#!/bin/bash
launchctl bootout "gui/$(id -u)/com.homebase.calendarsync" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.homebase.calendarsync.plist" "$HOME/.config/homebase/calendar.json"
rm -rf "$HOME/Library/Application Support/HomeBase/CalendarSync.app"
echo "Calendar sync removed."
