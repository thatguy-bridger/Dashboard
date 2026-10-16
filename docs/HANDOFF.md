# Home Base: project handoff summary

Wall-mounted home dashboard. Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4 + TypeScript. Repo `thatguy-bridger/dashboard`
(commit straight to `main`; Vercel auto-deploys, domain dashboard.bridgerjones.com). Data in Cloudflare D1 over REST (`src/lib/d1.ts`).
`AGENTS.md`: this Next version differs from older docs; check `node_modules/next/dist/docs/` before using unfamiliar APIs.

## Views (chosen per screen in Control, `/control`)
- **StandBy (default):** fixed 1440x900 design canvas, scaled to any screen; extra width/height is handed to the layout (`adapt()` in `StandBy.tsx`).
  Items are movable/resizable/toggleable in the editor (`StandByEditor`); layouts + **scenes** (schedule by time/days/weather/calendar keyword,
  optional dim and pure-black background) live in settings. Default scenes: Rainy day, Morning (big weather hero + clock + leave-by + agenda +
  day summary), Night (22:00-05:30, black, dimmed to ~18%), Evening (17:00-22:00). A screen can pin a scene or have its own StandBy profile.
- **Tiles:** the older free-form 12x7 widget grid with presets.
- **Touch:** control panel for a wall tablet: scenes, lights/switches (brightness sliders), speakers/TVs, Spotify controls. PIN-gated.
- `?layout=standby|grid|touch`, `?scene=<id|base>`, `?debug=1` (event log overlay), `?lite=1|0` (cheap fade instead of the ripple mask).

## Always-on pieces
- **TopBar** (all modes): weather chip, commute drive time (weekday mornings out / afternoons back), next-event countdown, device batteries
  (Find My). Each chip hides when an on-screen item already shows the same thing; same rule for pills.
- **ActivityPills:** top-centre glass pills for music (vinyl art that spins, sized to the title) and in-progress live games (team logos + score).
  No notification system anymore (fully removed on request).
- **Design language:** from `/Users/bridger.jones/Mac Apps/Islet/DESIGN.md` (black canvas, glass cards, caps labels, rounded numerals, calm motion).
  Rule: text may shrink to 50% (`FitText`/`Marquee`) before truncating. Both modes must adapt to screen size.

## Data and integrations
- **Weather:** Open-Meteo via `/api/weather`; default location Sandy, UT (`src/lib/location.ts`).
- **Calendar:** a Swift EventKit tool (`tools/calendar-sync`, installed as a LaunchAgent, every 15 min) pushes ALL Mac calendars (iCloud, Gmail,
  Microsoft/Exchange, subscriptions) incl. event locations to `/api/calendar/push` (auth: `NOTIFY_TOKEN` shared secret). `/api/calendar` serves them
  (falls back to Google/iCloud APIs if the push is >36h old). Hidden calendars are chosen in Control.
- **Spotify:** OAuth + now-playing (`/me/player`), lyrics via lrclib, controls (needs `user-modify-playback-state` + Premium). Shared adaptive poller.
- **Find My / iCloud:** unofficial session in D1 (batteries, locations). Fixed: rotated Set-Cookie is now saved; Control reads stored status only.
- **Smart home:** `src/lib/smarthome/`: Home Assistant provider (REST) + demo provider. Needs `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`, `CONTROL_PIN`.
  Plan: HA in a VirtualBox VM on an always-on Windows laptop (`tools/home-assistant-windows/`), reachable via Nabu Casa or Cloudflare Tunnel.
  Google Home has no web control API, so HA is the bridge (Cast/Nest speakers come through HA's Cast integration).
- **Leave by:** next timed event with a location, geocode + live TomTom route time from Home, minus a 5 min buffer.
- **Commute:** one address picked in Control (TomTom search); origin is the Home address.

## Usage budget (Vercel free tier hit 100% function invocations once)
Edge-cache headers on GET APIs (`src/lib/http.ts`), one shared poller per feed (`useSettings`, `useFeeds`, Spotify), `pollEvery` skips hidden tabs,
device heartbeat 2 min, presets only fetched in Tiles mode. Keep new polling slow and shared.

## Env vars (names only)
CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN, TOMTOM_API_KEY, NOTIFY_TOKEN (calendar sync secret), SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI,
GOOGLE_* and ICLOUD_* (Vercel only), HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN, CONTROL_PIN, UDOT_API_KEY (optional).

## Open items
- **TomTom key returns Unauthorized** (local and Vercel): commute chip, traffic widget, Leave by and address search are dead until a new key is set.
- Google OAuth and iCloud Find My need re-authentication from Control (Find My sessions may still be flaky; watch after the cookie fix).
- Calendar sync tool: re-run `tools/calendar-sync/install.sh` so event locations are sent (macOS will re-ask for Calendar access).
- Home Assistant box not set up yet (touch view runs on demo devices). Set a Home address in Control for commute/leave-by.
- Black-flash on the Fire Stick kiosk (Fully Kiosk): fixed likely causes (landscape layer swap, album art cleared between songs); verify with `?debug=1`.
- User mentioned an OBD/car idea earlier; no details were ever given.
- Old `notifications` D1 table is unused (left in place).
