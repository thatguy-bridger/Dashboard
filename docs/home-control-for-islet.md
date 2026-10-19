# Home Base control screen: what it does and how, for porting to Islet

The control screen is a touch dashboard for a wall tablet. It is a Next.js app (`src/components/TouchControl.tsx` is the screen),
backed by Home Assistant (HA) for everything physical and Spotify for music. This file lists what exists, the design decisions that
mattered, and the gotchas, so the parts you want can be rebuilt natively.

## 1. Shape of the system

- **Home Assistant is the only thing that talks to devices** (Tuya/Smart Life bulbs, Wyze plugs, Nest/Cast speakers, TVs, the tablet).
  The app calls HA's REST API (`/api/states`, `/api/services/<domain>/<service>`, `/api/template`, `/api/config/{script,automation}/config/<id>`)
  and, for media browsing, its websocket. HA is reached over Nabu Casa's remote URL with a long-lived token.
- **A provider interface** (`src/lib/smarthome/types.ts`) hides HA: `snapshot()`, `act(id, action)`, `actMany`, `leaveHome`, `returnHome`,
  `startTimer`, `fade`, `stopFade`. A demo provider exists for when HA isn't connected. For Islet this is the part to reimplement
  (a Swift HA client with the same few calls).
- **Settings live in one small key/value table** (Cloudflare D1, `settings(key, value)` holding JSON): device names/rooms/hidden list,
  scenes, timers, morning config, guest mode, music state, music-lights config, tablet config, battery log. Any store works.
- **Anything time-based runs inside HA, not in the app.** The app is serverless and can't keep a clock, so timers, dimming, the morning
  wake-up and the light fades are HA scripts/automations the app installs. Keep that idea.
- **Control PIN** gates every control endpoint (`x-control-pin` header, constant-time compare, env `CONTROL_PIN`).

## 2. Control screen features

- **Big All lights toggle** (tap = all on/off, drag sideways = dim all, long press = details). Reset button (plain white 100%) top-left of it,
  Turn off all top-right. Room buttons (rooms come from HA areas, one template call), then individual lights below the fold
  (tap toggle, long press for brightness / colour temperature / colour sheet, drag to dim).
- **Device kinds:** light, switch, fan (speed steps), media (speakers/TVs), scene, and **display** (a switch whose name says screen/monitor/
  display: kept out of the light counts). **Unavailable lights/plugs are dropped entirely** until they come back.
- **Per-light "stays on" flag** (LED plugs) so All off leaves them alone; the HA leave script is rebuilt when flags change.
- **Timers on every device** (turn on/off after N minutes): a one-off HA script with a delay, mode restart.
- **I'm leaving / I'm back:** one HA script call turns everything off (remembers state in a scene `home_base_before_leaving`), pauses music,
  keeps flagged devices on; "back" restores the scene and resumes music. Full-screen "Welcome back" on return. A second press while away
  must not overwrite the saved scene.
- **It's the night:** grows through the evening from 9pm; turns everything off, speakers to a night volume, tablet screen off.
- **Guest mode:** server-enforced (not just hidden UI): while the owner is away the screen shows one big light switch and the fan;
  PIN unlock for 4h; phone-proximity unlock (HA person entity + Wi-Fi SSID sensor).
- **Morning wake-up:** an HA automation: lights sunrise (brightness + colour temperature steps), fan, music at a set volume, tablet wakes.
- **Music card:** now playing, play/pause/skip, volume (drives every speaker, not TVs), up next (2-3 songs), start music with a default
  playlist (big button) or a picker, default speaker, hidden "network" list of every speaker HA knows.
- **Music lights (a scene):** lights take colours from the album art (details in section 4).
- **Top bar pills** (time, weather, commute, next event, who's home, this tablet's battery) with fit-to-width scaling.
- **Design:** several design languages (glass blur, fonts); text shrinks up to 50% before it is ever truncated.

## 3. Music: one brain, many screens (most important design)

Spotify rate-limits the whole app (HTTP 429 `QUOTA_EXCEEDED`, lock-outs of 1.5+ hours) when every screen polls it. So:

- **Only the server polls Spotify**, through one door (`src/lib/music/spotifyApi.ts`): adds the token, counts requests, and when any request
  gets a 429 it stores the lock-out end time in the database so every instance stops asking.
- **One record of the music** (`MusicState`): track, position (+ the moment it was measured), playing, volume, device, next songs,
  cover colours, source (`spotify | speaker | estimate | idle`), origin (app + speaker), lock-out time, lights bookkeeping.
  Screens only read it (`GET /api/music/state`, ~8s while playing, dormant when nobody is there); they estimate the position locally.
- **Updater = HA nudges the app** (`do=tick` on a secret-protected hook URL via an HA `rest_command`) every 5s while any speaker plays,
  once a minute otherwise, and **immediately on any speaker state/title change**. That makes song changes show within about a second.
- **Cross-checking** (`src/lib/music/conductor.ts`): the speakers (HA media_player title/artist/position/art/app, one template call) are a
  second source. Rules: a speaker that stopped overrides Spotify after two updates in a row; a speaker that moved on to the queued next
  song is believed at once; a speaker playing something Spotify doesn't show (another app) is believed after two updates; with Spotify
  locked out or silent the speaker alone drives the screen (title, artist, art, position, length); no known length = "live".
  While a speaker confirms the same Spotify song, Spotify's last answer is reused (asked again on song change or every 30s).
- **Look-ahead:** the queue is read on every song change; the next cover's colours are computed ahead of time.
- **Commands** (`POST /api/music/command` play/pause/next/previous/volume): update the record first (every screen reacts together),
  call Spotify (or the speaker itself when the source is not Spotify), then a forced update ~0.7s later confirms.
- **Playlist start** (`src/lib/spotifyPlay.ts`): Spotify's device list only shows Nest/Cast speakers while a Spotify session is already running on them.
  So: wake the HA speaker, poll the device list, else ask Google Assistant (HA `google_assistant_sdk.send_text_command`) to start
  Spotify there, then start the playlist **through Spotify**. Never trust Assistant with a playlist name (it plays a song of the same name).
- Playlists are cached 10 minutes (shows during a lock-out); speaker cover art is proxied by the app (`/api/music/art`) because HA serves it behind login.

## 4. Music lights (album-art scene)

- **Palette** (`src/lib/palette.ts`, shared by browser and server): 160x160 RGBA, 12-bucket hue histogram for the accent; for lights,
  36x10° buckets clustered within ±30°, a cluster counts only if it is ≥22% of the biggest and ≥7% of all colour, max 4 colours. Only clearly
  coloured, clearly lit pixels count, so a one-colour cover gives one colour. Black-and-white covers get a colour picked from the song id
  (never white: white is much brighter on these bulbs).
- **Per light mode:** `color` (follows art; colour bulbs only), `on` (neutral 4000K white), `off`. Default: Light Bars colour, the rest off.
- **Per-model hue calibration** (Tuya "Color Light" renders yellow greenish: pull 60° toward 46°, etc.).
- **The whole song is planned ahead** (`src/lib/music/lights.ts`): song start (instant colour, brightening 25→100% over 5s when coming from
  the previous song's dip), colour-only shifts every max(15s, length/10) (never in the last 8s; small hue changes glide in 4 steps over 12s,
  jumps >50° switch instantly), a dip to 25% starting 5.5s before the end, and the **next song's colours at length − 450ms**
  (the command takes ~0.5s to reach a bulb). A plan made mid-song folds everything already passed into one catch-up step.
- **Execution is inside HA:** one restartable script per light (`hb_fade_<light>`, mode `restart`) takes `frames: [{data|off, wait}]` and
  `start_in`; starting it again cancels the old plan, so nothing can fight. Tuya has no transition support, so fades are stepped frames.
- **Re-plan** when the song, light modes or next song change, or the position drifts >3.5s from the plan (skip/seek); paused = stop plans.
  Works with every screen asleep. Disable = stop plans + plain white 100%.

## 5. The tablet itself (Fire HD 8, Fully Kiosk free, HA Companion app)

- **Presence = camera motion** (a Python daemon on HA diffs frames from the tablet's IP camera, posts to an HA webhook → template binary_sensor
  `binary_sensor.tablet_camera_motion`, auto-off 3s). A cheaper PIR/radar sensor would replace this (the camera is the biggest battery cost).
- **HA automations** (installed by the app, notify service `mobile_app_<tablet>`): motion → screen on + brightness (110/255; night-quiet rule: after
  9pm with all lights off, motion does not wake it); no motion for 5s → dim script (brightness steps at 76/56/35/18% of awake, 3s apart, then 1, then screen off);
  away + motion/phone arrives → lights and music return.
- **Content dims with the backlight:** the page asks HA how long the sensor has been quiet (`/api/home/presence`, HA-side clock) and fades a
  black layer over the same 5s→20s schedule; touch undoes it. (A backlight at minimum still shows bright content.)
- **Calm mode / dormancy (touch controller only):** no touch AND nobody in front for 2 min → animations pause; 10 min (or night, 30s) → glass blur off;
  3 min → every poller stops (`pollEvery` honours it) and catches up on wake. Standby displays never do this.
- **Battery log:** HA calls the app every 3 min; stores level, charging, screen share (estimated from the motion sensor history), motion, music;
  report of drain per hour by situation. The Companion app only reports battery level/state unless more sensors are enabled.

## 6. App API (all PIN-gated unless noted)

| Endpoint | Purpose |
|---|---|
| `GET /api/home` | snapshot of lights/switches/fans/displays/media/scenes + away/keepOn/timers/morning/guest/people |
| `POST /api/home/action`, `GET /api/home/state?ids=` | act on one or many devices; fast re-read of a few |
| `GET/POST /api/home/config`, `/api/home/scenes` | names, rooms, hidden list; saved scenes |
| `POST /api/home/{away,keep,timer,night,morning,guest}` | leave/return, stays-on flag, timers, night mode, morning config, guest mode |
| `GET/POST /api/home/screen`, `GET /api/home/presence`, `GET /api/home/battery` | tablet brightness/service config, motion idle, battery report |
| `GET /api/music/state` (open), `POST /api/music/command`, `GET/POST /api/music/lights`, `GET /api/music/art` | music record, controls, lights scene, speaker art |
| `GET/POST /api/spotify/playlists`, `POST /api/spotify/play-playlist`, `POST /api/spotify/resume` | library, default playlist/speaker, start, resume |
| `GET /api/home/hook?secret=…&do=tick\|battery\|resume_music\|morning_music` | what HA calls back (secret in D1, shown with PIN) |

## 7. What gets installed into HA (so a new client doesn't redo it)

- `rest_command.home_base_hook` (URL with `{{ do }}`) in `configuration.yaml`; the motion sensor + shell_command for the camera daemon.
- Scripts: `home_base_leaving`, `home_base_returning`, `home_base_dim`, `hb_fade_<light>` (one per light), `hb_timer_<device>`.
- Automations: wake on motion, dim when idle, arrive home, morning wake-up, `home_base_music_tick`, `home_base_battery_log`.

## 8. Gotchas worth keeping

- Spotify: one poller only; Nest/Cast devices vanish from `/me/player/devices` when idle; dev-mode quota is tiny; never start test playback and leave it.
- HA entity quirks: unavailable devices must be filtered from scripts too; `device_entities(device_id(...))` lists a device's sensors;
  state triggers need `to: null` to ignore attribute-only changes.
- Tuya bulbs: no transitions, cloud latency ~0.4s, yellow hue needs calibration; white is far brighter than colour.
- Serverless limits (1M requests/month, Active CPU hours): every poller must stop when nobody is there; keep timing logic in HA.
- Android: HA's `command_screen_off` only turns the screen off (it cannot power off); the Companion app notify commands are the only remote control.

## 9. For a native Mac app (suggested port order)

1. HA client: states + services + template, token in Keychain; same device kinds and the unavailable/display rules.
2. Control UI: All toggle, rooms, tiles, long-press sheets, leave/back, night, timers.
3. Music: read Spotify and the speakers directly (no serverless limits, so poll the speakers over HA's websocket subscription for instant changes),
   keep the single-poller + cross-check + look-ahead ideas, and run the lights plan as HA scripts exactly as above.
4. Skip everything tablet-specific (dimming, calm mode, battery log, camera motion).
