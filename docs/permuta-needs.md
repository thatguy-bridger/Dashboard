# What the dashboard needs from Permuta

Everything goes through the existing contract: Permuta calls `dash_write(p_token, p_kind, p_key, p_value)` and the page reads it through `/api/screen`
(PIN-protected). Every row is optional; the page ignores what it doesn't understand and hides what it doesn't have. Times are epoch **seconds** unless
a name ends in `Ms`. Colours are `"#RRGGBB"`. Icon names come from `src/components/Icon.tsx` (never emoji).

## Already supplied by Permuta (works today)

| key | what the page does with it |
|---|---|
| `state:agenda` `{events:[{title,start,end,allDay,color}]}` | next-event pill, Next Up strip, countdown (Soon), timeline (Day), Today page |
| `state:music` `{playing,track,artist,album,art,progress,duration,at,device,volume}` | Music scene, controls, accent from the art |
| `state:status` `{away,at}` | `at` is the heartbeat: older than `staleSec` (default 180 s) = the Offline scene |
| `config:screen` `{widgets,accent,hideRooms,hours24}` | see "config:screen" below |
| `config:location` `{lat,lon}` | weather (fetched by the page's server from Open-Meteo) |
| `state:lyrics` `{id, lines:[[seconds,"text"],...]}` **done on the Permuta side** | live lyrics: shown only when `lyrics.id === music.trackId` and music is playing; `lines` may be empty |
| `state:music.trackId` (Spotify track id) | pairs the lyrics with the song |

Position used for lyrics: `music.progress + (now - music.at)/1000 + 0.3 s`, re-derived from the clock every frame, so seeks and pauses are always right.

## Small additions to existing rows (all optional)

- `state:agenda.events[].location` (string), `.tier` (0 background, 1 normal, 2 important, 3 critical: events below `soonMinTier` never take over),
  `.kind` (`"school"`, `"church"`, … : a day with an event of a kind in `dayKinds` gets the Timeline).
- `state:music.next` `{track, artist, art}`: shown as "Next" and the next cover is preloaded (no pop-in).

## config:screen (written by Permuta's Screens tab)

```json
{
  "widgets": ["clock","weather","agenda","music"], "accent": "#7C8CFF", "hideRooms": [], "hours24": false,
  "order": ["offline","soon","away","music","night","day","morning","idle"], "disabled": [],
  "soonLeadMin": 15, "soonStayMin": 5, "soonMinTier": 1,
  "nightStart": 22, "nightEnd": 6, "morningStart": 6, "morningEnd": 9,
  "dayMinEvents": 3, "dayKinds": ["school","church"],
  "musicHoldSec": 90, "staleSec": 180, "minDwellSec": 20,
  "focusThreshold": 50, "calmAfterSec": 90, "pageSec": 20,
  "pulseMin": 4, "reloadMin": 60, "versionMin": 5
}
```
`hours24`: false/absent = 12-hour with a small AM/PM; true = 24-hour, no suffix. It applies to every time on the page (clock, events, countdowns,
timeline labels, calm pages). All other fields are tuning knobs with the defaults shown; none is required.

## config:theme (so the page looks like the app)

```json
{ "accent": "#7C8CFF", "font": "rounded", "glass": 0.5, "radius": 1.0, "dark": true, "artAccent": true }
```
`font`: `default | rounded | serif | mono`. `glass` 0 to 1 (how strong the glass fill is). `radius` 0.4 to 1.6 (corner scale, 1 = normal).
`dark`: false = a light display. `artAccent`: tint the accent from the album art while music plays.

## New rows: one per information source (each optional; the page skips pages and zones that have no data)

### state:school
```json
{ "day": "A",
  "now":  { "period": "3", "class": "Chemistry",    "room": "214", "start": 1794112950, "end": 1794115950 },
  "next": { "period": "4", "class": "Pre-Calculus", "room": "118", "start": 1794116250, "end": 1794119250 },
  "periods": [ { "period": "1", "class": "English 11", "room": "102", "start": 0, "end": 0 } ] }
```
Used for: a strip card ("Chemistry · until 10:30" / "Next: Pre-Calculus in 12 min"), the School page, and a focus score of 70 when the next class is within 15 min.

### state:mail
```json
{ "unread": 12, "priority": 2,
  "missionaries": [ { "name": "Elder Jones", "unread": 1, "last": "Week 14: a miracle", "at": 1794100000 } ],
  "recent": [ { "from": "Coach Miller", "subject": "Practice moved", "at": 1794100000 } ] }
```
Used for: the count on the Mail rail icon (`priority` if > 0, else `unread`), the Mail page, focus score 60 when `priority > 0` or a missionary has unread.

### state:journal
```json
{ "due": true, "wroteToday": false, "streak": 12, "best": 40, "prompt": "What made you laugh today?" }
```
Used for: a dot on the Journal rail icon when `due`, the Journal page, focus score 45 when `due`.

### state:car
```json
{ "fuelPct": 62, "batteryPct": null, "rangeMi": 240, "charging": false, "locked": true, "parkedAt": "Home",
  "lastDrive": { "miles": 11.2, "minutes": 24, "at": 1794100000 } }
```
Used for: a "Car fuel 9%" / "Car battery 14%" pill when low (fuel <= 15, battery <= 20 and not charging; focus score 65), a corner peek "Car is unlocked" when `locked === false`.

### state:battery  (the tablet running the page, or any device Permuta reports)
```json
{ "pct": 14, "charging": false }
```
Used for: a "Tablet battery 14%" pill when <= 20% and not charging (focus score 55).

### state:life
```json
{ "stats": [ { "label": "Music today", "value": "2h 10m", "detail": "20 min more than usual", "icon": "note" } ] }
```
Up to 6 cards on the Life page (`icon` must be a name from the icon set; omit for a default).

### state:info (anything else: no page change needed)
A list (or `{ "items": [...] }`) of items for the zones:
```json
[ { "id": "garage", "zone": "takeover", "title": "Garage door open", "detail": "for 20 minutes", "icon": "alert", "priority": 90, "until": 1794116000000 },
  { "id": "pkg", "zone": "pill", "title": "Package delivered", "icon": "home", "priority": 70, "scenes": ["idle","music"] },
  { "id": "m", "zone": "badge", "rail": "mail", "title": "Mail", "count": 3 } ]
```
`zone`: `pill` (top, at most 2), `strip` (bottom, at most 4), `badge` (needs `rail`: `today|calendar|music|home|mail|journal`; `count` or `dot`), `peek` (one corner item), `takeover` (urgent banner).
Optional: `priority` 0 to 100, `scenes` / `hideIn` (scene ids), `color`, `icon`, `until` (epoch **ms**; takeover defaults to five minutes from first seen).

## How the page decides (so Permuta's knobs make sense)

1. **Scene** (`src/lib/scenes.ts`): offline, soon, away, music, night, day, morning, idle, in the order above; a scene is held for at least `minDwellSec`
   unless it stops applying or is urgent (soon, offline).
2. **Focus or calm** (`src/lib/focus.ts`): every source has a score 0 to 100. Focus (hero scene plus pills, strip, badges, peek, takeover) when the scene is
   anything but idle or any score is >= `focusThreshold`; calm (full-screen pages rotating every `pageSec`, skipping empty ones) only after the scene has been plain idle
   with all scores under the threshold minus 10 for `calmAfterSec`. Anything pressing returns to focus at once.
3. **Self-care**: a pulse and data refresh every `pulseMin`; a soft full reload every `reloadMin` (never during a Soon scene) or when `/api/version` changes.

## Per-screen configuration (screens register themselves; Permuta manages them)

Every browser that runs the page makes a random id once (localStorage `dash-device`) and calls `dash_device_ping(p_pin, p_id, p_info)` on load and every ~15 s through
`POST /api/device {op:"ping"}`; `p_info = { ua, w, h, scene, mode, ver, name?, battery?: { pct, charging } }` (`battery` only where the browser has `navigator.getBattery`; the page also feeds it into its own battery pill, "Tablet battery 14%", so it works without Permuta). The returned config is authoritative and applied live (no reload); if the server can't be
reached the last config (kept in localStorage) keeps being used and pings retry quietly. On-screen settings use `dash_device_self(p_pin, p_id, p_config)`.
Permuta (write token) lists and edits screens with `dash_devices_list` / `dash_device_set` / `dash_device_remove`.

```json
{ "name": "", "role": "display", "view": "auto", "locked": false, "dim": "auto", "guest": false }
```
`role`: `display` (the situational page) or `control` (a full-time home-control touch panel). `view` (displays): `auto`, `standby`, `music`, `timeline`, `calm`, `home`
(`home` = the control panel). `locked`: opening the hidden settings sheet on that screen asks for the PIN again. `dim`: `auto` (dim at night, bright on touch for panels) or `never`.
`guest` (new): `true` makes that screen show ONLY a big Lights switch (every light and plug) and the fan control; no rail, pages, island or settings. The hidden trigger
(5 taps in the top-left corner, or press and hold the clock) then only asks for the PIN, and a correct PIN lifts guest mode on that screen for 4 hours (kept locally, so it
comes back by itself). The on-screen settings sheet has a Guest switch; Permuta's Screens tab can add the same switch (`dash_device_set` with `{ "guest": true }`).
Nothing else is needed from Permuta for this. (`dash_device_self` / `dash_device_set` / `dash_device_ping` merge any JSON, so `guest` and `info.battery` need no database change.)

## Timers, welcome back, tablet battery (this round)

- **Timers**: the Home popover has "Switch off after 15 min / 30 min / 1 h / 2 h" (or "on after" for a device that is off), an "Off at 10:45" readout and Cancel. `POST /api/act`
  `{ op: "timer", id | ids, minutes, on? }` becomes `script.turn_on script.permuta_timer` with `variables { entity, minutes, on }` (one run per entity; only light/fan/switch ids, minutes 1 to 720);
  `{ op: "cancelTimers" }` becomes `script.turn_off script.permuta_timer`. The script is in parallel mode, so turning it off stops every run: cancelling one light starts the others again with their remaining time (rounded up to a minute).
  The page remembers what it started (localStorage `dash-timers`) to show a small timer glyph and the time on the tile; a timer started from somewhere else is not shown.
- **Welcome back**: when `away` goes true to false (also by undoing the Leaving scene, which flips it optimistically) the page shows a full-screen welcome for about 8 s (greeting, weather, next event, unread mail count from `state:mail.unread`), then fades. Leaving shows a quiet "Goodbye" for about 3.5 s. Never on first load.
- **Theme and screen knobs**: `config:theme` (accent, font, glass, radius, dark, artAccent) and `config:screen` (`disabled`, soonLeadMin, soonStayMin, night/morning windows, calmAfterSec, pageSec, minDwellSec) were already honoured; `state:life` is drawn on the Life page.

## Music extras (this round)

- `state:music.palette` = `["#RRGGBB", ...]` (1 to 4 colours: the same ones the lights use, already hue-corrected). The song title is painted with a soft gradient of them (the accent follows the first); without it the page uses a colour taken from the album art.
- `state:music.next` = `{ "id": "spotify track id", "track": "...", "artist": "...", "art": "https://...", "duration": 217, "palette": ["#RRGGBB"], "lyricsId": "..." }` and `state:lyrics_next` = `{ "id": "...", "lines": [[seconds, "text"], ...] }`.
  When the playing song's extrapolated position passes its `duration`, the page rolls over to `next` at once (position counted from the predicted end moment; art, title, palette and lyrics swap with the normal cross-fade) and keeps running on that prediction. A later report for the same song reconciles with a gentle correction (at most 25% of real time); a report for a different song is switched to immediately. With no `next`, the page holds at the end in a paused look instead of showing 3:37 / 3:37 for ever. `state:music.progress` and `at` stay as before.
- `state:lights` = `{ "on": true, "lights": [{ "id": "light.x", "name": "Light bar 1", "mode": "art" | "white" | "off" | "leave", "color": "#RRGGBB" }] }`: the quiet "Music lights" row on the Music scene (only `art` and `white` lights are shown; the whole row hides when `on` is false). `color` is the light's current colour and fades slowly.

## API additions on the page's server (no Permuta change needed)

- `/api/act` op `color` `{ ids: ["light.x"], h: 0-360, s: 0-100 }` -> `light.turn_on` with `hs_color` (brightness untouched); op `kelvin` now also takes `ids`.
- `/api/home` returns `color: [h, s]` for lights that report an hs colour.
- `/api/screen` returns `lyrics`, `lyricsNext`, `lights`, `info` and `extra` (every other `state:*` row, e.g. school, mail, journal, car, battery, life).
