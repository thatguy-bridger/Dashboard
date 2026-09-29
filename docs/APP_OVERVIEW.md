# Home Base — app overview

Personal kiosk dashboard for Bridger's household. One codebase, deployed on
Vercel, drives two kinds of screens: wall-mounted tablets/browsers running
`/screen` (read-only, kiosk view), and `/control` (the admin panel used from
a phone/laptop to approve devices, assign layouts, and manage integrations).
This doc is for onboarding a fresh session — read it before touching
layout, styling, or app structure.

## Stack

- **Next.js 16 (App Router, Turbopack)**, React 19, Tailwind v4.
- **Vercel** hosting, serverless API routes under `src/app/api/*`.
- **Cloudflare D1** (SQLite) is the only datastore — no ORM, just
  parameterized SQL via `d1Query()` in `src/lib/d1.ts`, which calls
  Cloudflare's HTTP query API directly (`CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN` env vars). Database
  name: `home-base-registry`.
- No migration files exist — tables were created ad hoc via the Cloudflare
  MCP D1 tools during development. If you add a table, create it the same
  way (direct `CREATE TABLE IF NOT EXISTS` against the live D1 database)
  and document it here.
- No auth on `/control` currently — it's trusted-network/URL-obscurity only.

## The two screens

### `/screen` (`src/app/screen/page.tsx`)

- Full-viewport, 4-column × 3-row CSS grid (`ScreenGrid`). Each widget
  occupies a `{col, row}` span from `SIZE_SPANS` based on its `WidgetSize`
  (`sm`/`md`/`lg`/`xl`).
- On mount, registers itself via `useDevice()` (`src/lib/useDevice.ts`):
  generates/reads a persistent device id (`src/lib/deviceId.ts`, stored in
  localStorage), heartbeats `POST /api/devices` every 20s (ip, user-agent,
  touch-capability), and polls its own record `GET /api/devices/:id` every
  3s so approval/preset changes from Control show up almost instantly.
- Unapproved/rejected devices see a waiting/rejected notice
  (`UnapprovedNotice`) instead of the grid.
- An approved device with no assigned preset falls back to whichever
  preset is flagged `isDefault` (`usePreset()` hook) — new devices always
  show *something* useful instead of a blank screen.
- Supports two special query-param modes used only by Control's live
  preview, not by real kiosks:
  - `?draft=type:size,type:size,...` — renders an arbitrary widget list
    without touching any saved preset (used while editing a preset before
    publishing).
  - `?preview=<deviceId>` — mirrors another device's live state (used for
    the little screen thumbnails in Control's "Live screens" section).
- Every tile gets a small bottom-right badge (`WidgetBadge`) showing an
  orb + that widget's label (`WIDGET_LABELS`) — this replaced an earlier
  fixed top-left "device name" badge; kiosk viewers care what each *tile*
  is, not which physical screen they're looking at.

### `/control` (`src/app/control/page.tsx`)

One long page, sectioned with a shared `glass-panel` card style:
1. **Live screens** — thumbnail iframes of each approved device via
   `ScreenPreview`, pointed at `/screen?preview=<id>`.
2. **iCloud Find My** — `<FindMyConnect />`, the password+2FA connect flow.
3. **Devices** — list of every device that's ever heartbeat, with
   inline rename, approve/reject, and a preset-assignment dropdown.
4. **Google Account** — single shared OAuth connection (not per-device);
   powers Gmail/Drive/Calendar/Photos widgets for every screen at once.
   Includes `<GooglePhotosConnect />` (Picker API session) once connected.
5. **Settings** — currently just the favorite-team text field used by the
   Sports widget.
6. **Countdowns** — CRUD for the Countdown widget's target dates (label +
   date picker), backed by the `countdowns` D1 table.
7. **Presets** — create/edit/delete named widget layouts. Editing a preset
   opens a live `<ScreenPreview>` of the *actual* `/screen` render via the
   `?draft=` param, updated instantly as you toggle widgets — publishing
   just PATCHes the preset's `widgets` JSON, which every device showing
   that preset picks up on its next 3s poll.

## Widget system

Everything widget-related is typed centrally in `src/lib/presets.ts`:

- `WIDGET_TYPES` — the canonical list of widget type strings.
- `WIDGET_LABELS` — display name per type (used in Control's picker and
  the on-screen `WidgetBadge`).
- `WIDGET_SIZES` / `SIZE_SPANS` — the 4 sizes and their grid-cell spans.
- `Preset` / `PresetWidget` — a preset is just `{ id, name, widgets: {type,
  size}[], isDefault, ... }`, stored as a JSON blob in the `presets` table.

`src/components/WidgetRenderer.tsx` is the single switch statement mapping
`WidgetType` → the actual component. **Adding a new widget = one line in
each of `WIDGET_TYPES`, `WIDGET_LABELS`, and `WidgetRenderer`'s switch,
plus the component itself.** Nothing else needs to know a new widget type
exists — Control's picker and the screen grid both read from these shared
constants.

Every widget component takes just `{ size?: WidgetSize }`, fetches its own
data client-side from its own `/api/*` route on an interval, and renders
differently (or not at all) per size — see `WeatherWidget.tsx` for the
clearest example of the size-tiering pattern (sm = number only, md = + one
line, lg/xl = full detail).

### Widgets that exist today

| Type | Component | Data source |
|---|---|---|
| `clock` | ClockWidget | pure client |
| `weather` | WeatherWidget | Open-Meteo (free, no key) |
| `worldclocks` | WorldClocksWidget | pure client |
| `news` | NewsWidget | `/api/news` |
| `sports` | SportsWidget | `/api/sports`, favorite/all toggle + live carousel |
| `calendar` | CalendarWidget | Google Calendar (shared OAuth) |
| `locations` | LocationsWidget | iCloud Find My, rendered on a MapLibre dark map |
| `gmail` | GmailWidget | Gmail API (shared OAuth) |
| `drive` | DriveWidget | Drive API (shared OAuth) |
| `photos` | PhotosWidget | Google Photos Picker API |
| `traffic` | TrafficCameraWidget | UDOT camera snapshot API (needs `UDOT_API_KEY`) |
| `countdown` | CountdownWidget | `countdowns` D1 table, managed in Control |

## Integrations and where their state lives

- **iCloud Find My** (`src/lib/icloudSession.ts`, `icloud.ts`) — bypasses
  a lot of the `icloudjs` package directly due to Apple protocol changes;
  session persisted in the `icloud_sessions` D1 table. Login/2FA happens
  through `/api/icloud/findmy/{login,verify,resend}`; the widget itself
  only ever reads from `/api/icloud/findmy`.
- **Google (Gmail/Drive/Calendar/Photos)** — one shared OAuth token set
  for the whole household, stored in the `google_tokens` table
  (`src/lib/google.ts`). `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
  `GOOGLE_REDIRECT_URI` env vars. Photos specifically uses the Picker API
  (`googlePhotos.ts`) since the Library API's broad scopes are gone.
- **Reverse geocoding** — `src/lib/geocode.ts`, OSM Nominatim, cached in
  the `geocode_cache` table so repeated lookups near the same spot don't
  re-hit the API.
- **UDOT traffic** — `src/app/api/udot/route.ts`, stateless, just proxies
  UDOT's camera API with an env-var key.

## D1 tables (current)

`devices`, `presets`, `settings`, `google_tokens`, `icloud_sessions`,
`geocode_cache`, `countdowns`. Schemas are defined only by the `CREATE
TABLE` statements that were run against D1 and the row-shape interfaces in
each `src/lib/*.ts` file — there's no single schema file to check for
drift, so if you change a table's shape, update both places.

## Env vars required in production

`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
`CLOUDFLARE_API_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `ICLOUD_EMAIL`, `ICLOUD_APP_PASSWORD` (optional,
for one shared iCloud session), `UDOT_API_KEY` (optional, traffic widget
no-ops without it), `UDOT_CAMERA_ID` (optional, defaults to one camera).

## Known build quirks (don't "fix" these without understanding why)

- `next.config.ts` has `serverExternalPackages: ["keytar"]` — `icloudjs`
  pulls in `keytar` (a native binary) which breaks the Turbopack bundle
  otherwise.
- `scripts/copy-maplibre-worker.js` runs on `postinstall` — MapLibre GL
  v6's worker doesn't load correctly under Turbopack without manually
  copying it and calling `setWorkerUrl()` (see `LocationsMap.tsx`).
- `AGENTS.md`/the block at the top of `CLAUDE.md` is auto-regenerated by
  `next dev` (`node_modules/next/dist/server/lib/generate-agent-files.js`)
  — don't delete it, committing it back is expected/harmless.

## What's explicitly out of scope for a visual refactor

Per the current plan: **the widget-system architecture, the D1-backed
lib/api layer, and the preset/device model described above are staying
as-is.** A frontend refactor should be free to change layout, styling,
component internals, and even how `ScreenGrid`/`ControlPage` are composed
visually — but should keep consuming the same `WIDGET_TYPES` /
`WidgetRenderer` contract and the same `/api/*` endpoints, so new widgets
built in the other session (this doc's author) keep working without
cross-coordination.

## Idea backlog

A separate, much longer concept/brainstorm document (not code, not in this
repo) lists dozens of future integrations and widget ideas — Plaid
finances, GroupMe, Spotify, Canvas, UDOT-adjacent Utah civic data, a
missionary-tracking tile, hobby widgets, etc. — each tagged Build/Reach/
not-pursuing after real feasibility research. Ask Bridger for the Artifact
link if you need it; nothing there is committed to being built yet except
what's already landed in this repo.

### Next up: Find My "Friends" (non-family location sharing)

Bridger's real Find My app shows dozens of people via Apple's **Friends**
feature (contacts who share their location with him outside Family
Sharing) — Snap-Map-style photo bubbles. The Locations widget here only
ever shows **Family Sharing** members plus his own devices, because that's
all the `findme` web service (`fmipservice/client/web/refreshClient`,
`fmly: true`) actually returns — confirmed by reading his live session's
`accountInfo.webservices` list directly from D1: there is no separate
Friends/`fmf`-style web service exposed at all, only `findme`.

That's a real signal, not just an unexplored endpoint: Apple's web-facing
iCloud service discovery for this account doesn't advertise anything for
Friends, which suggests that feature isn't reachable through the same
kind of reverse-engineered web-session approach that made the family/
device integration possible. Confirming that for certain (vs. it being
gated behind some other account state) would need an actual capture of
the native Find My app's network traffic (e.g. a proxy tool like
Proxyman/Charles on the phone while opening the Friends list) to find the
real request Apple's app makes and try replicating it — guessing endpoint
paths blind isn't worth the risk of hitting Apple's infra with malformed
requests repeatedly.

Also requested: showing **profile photos** instead of initials/dots once
this works. Apple ID contact photos aren't part of the `findme` response
either way, so that'd need its own source — the most realistic one given
what's already connected is Google Contacts photos (OAuth already set up
for Gmail/Calendar/Drive), matched by name/phone, with a manual
per-person photo override in Control as a fallback for anyone not in
Google Contacts.
