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

## Per-screen roles and the hidden settings

Each screen registers itself (`/api/device`, see `docs/permuta-needs.md`). A display shows the situational page (optionally pinned to a view); a control panel
(`role: control` or `view: home`) is a full-time home-control touch panel. Settings are opened with no visible button: press and hold any clock for 3 s, or tap the top-left
corner five times quickly; a locked screen asks for the PIN again first. Mock preview: `?role=control&view=home`, `?device=locked`, `?view=standby|music|timeline|calm`, `?dim=never`, `?name=Kitchen`.

## Frame, fonts, prediction, Home

- **Frame**: a strict grid with named areas (`rail | head / hero / foot`, `src/components/frame.tsx`); nothing is positioned over anything else. `window.__layoutCheck()` in the mock harness walks the rendered boxes and reports overlaps (checked at 1920x1080, 1280x720, 1024x600, 800x480 and 1024x768).
- **Fonts**: self-hosted with next/font (`src/app/layout.tsx`): Figtree for words, Nunito for numerals (tabular figures), weights 400 to 600. `config:theme.font` switches `rounded` (default) / `default` / `serif` / `mono`. Preview the alternative pairing (DM Sans + Quicksand) with `?font=b` in the mock.
- **Prediction** (`src/lib/predict.ts`): song rollover and reconcile, optimistic controls, passed events dropping out; all pure and tested.
- **Home** is a normal page (`src/components/home.tsx`): tiles (tap = toggle, drag = level, hold = detail popover), colour picker, optimistic everywhere. The control role shows the same page full-time.
- **Glass indicator** (`src/components/glass.tsx`): one shared sliding indicator for the rail and the segmented pickers.

## The dynamic island

The header's centre (`src/components/island.tsx`, `src/lib/island.ts`, `src/lib/activities.ts`): ONE main item = the most pressing activity from OTHER pages (what the current page already shows is excluded; on the Calendar page a playing song is the main item, on the Music page it isn't),
with up to three satellites per side (weather always first; one per kind; never the main item). Scores reuse the focus-score idea (`buildActivities`); a minimum dwell (8 s) plus a hysteresis margin keep it from flickering, and urgent items (an event about to start, an alert) bypass the dwell.
Tap the main item for a compact card with real controls (closes on an outside tap or after 6 s); long-press jumps to its page; tap a satellite to pin it as the main item for 10 s. `fitIsland` measures the header and drops satellites from the outside in, then shrinks the pill, so it can never collide with the clock.
Mock: `?mock=music&go=calendar` (go = today | calendar | music | home | mail | journal), `?mock=takeover`, `?mock=bare`.

## Tablet features (timers, welcome back, battery, guest, morning)
See `docs/permuta-needs.md` ("Timers, welcome back, tablet battery"). Pure logic with tests: `src/lib/timer.ts`, `welcome.ts`, `battery.ts`, `guest.ts` (`features.test.ts`).
Mock hooks (local build with `NEXT_PUBLIC_DASH_MOCK=1`): `?mock=welcome` (holds the welcome screen), `?device=guest` (PIN 4242 lifts it), `?battery=14&charging=0`, `?mock=morning&scene=morning` (school periods).
