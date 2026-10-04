# Calendar Sync (Mac to dashboard)

The dashboard can't see Exchange/Microsoft calendars through Google or iCloud. The Mac's Calendar app can, so this
tiny app reads everything Calendar shows (via EventKit) and posts the next 14 days to `/api/calendar/push`.

- `./install.sh` builds the app, stores the dashboard URL + token in `~/.config/homebase/calendar.json`, and installs a
  LaunchAgent that runs it every 15 minutes. macOS asks once for Calendar access.
- Pick which calendars to show in Control, under "Calendars (from your Mac)".
- `./uninstall.sh` removes the job, config and app.
- Test without posting: `build/CalendarSync.app/Contents/MacOS/CalendarSync --dry-run --out /tmp/cal.json`
