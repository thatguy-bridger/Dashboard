# dashboard.bridgerjones.com

Just the page. Permuta (the Mac app) controls it: layout, widgets and live data are saved in Supabase (`dash_kv`) by Permuta;
this app only reads them and talks to Home Assistant for the touch controls.

- `src/app/page.tsx` the standby display and the touch controller
- `/api/screen` Permuta's config and live state (+ weather); `/api/home` and `/api/act` Home Assistant
- Every endpoint needs the control PIN. Permuta sets it (it's stored hashed in Supabase, with a lock-out after 8 wrong tries); the device keeps it after one unlock.

Environment: `SUPABASE_URL`, `SUPABASE_KEY` (the publishable key), `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`. No other secrets live here.
The old app is archived in Permuta/Dashboard (with its git history).

## How it works (the rework)

- `src/lib/scenes.ts` picks the hero scene from the situation (pure, tested). `src/lib/focus.ts` decides focus or calm. `src/lib/sources/*` is the info-source registry
  (one small module per kind of information: zone items, a 0 to 100 score, an optional calm page). `src/lib/slots.ts` collects the zones. `src/lib/lyrics.ts` finds the current line.
- Visual layer: `src/scenes` (hero scenes), `src/calm` (calm pages), `src/components` (rail, zones, widgets, timeline, lyrics, icons). All use the shared tokens in `globals.css`.
- Tests: `npm test` (scene rules, sources and scores, focus hysteresis, rotation, lyrics, slots, formatting, and a guard that no emoji appears in `src/`).
- Local preview with fake data (never on Vercel): `NEXT_PUBLIC_DASH_MOCK=1 npx next build && NEXT_PUBLIC_DASH_MOCK=1 npx next start -p 3124`, then
  `/?mock=music|paused|soon|day|busy|calm|takeover|away|offline|nightmusic|idle&at=HH:MM&long=1&page=weather|school|mail|journal|life|today&h24=1&lyrics=0&pulse=1`.
- What Permuta must supply: `docs/permuta-needs.md`.
