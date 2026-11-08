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
