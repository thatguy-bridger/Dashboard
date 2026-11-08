"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Home } from "@/lib/ha";
import { decide, resolveConfig, settle, type SceneId, type SceneState } from "@/lib/scenes";
import { decideMode, resolveFocus, rotation, type ModeState } from "@/lib/focus";
import { calmPages, focusScore, sourceItems, type SourceCtx } from "@/lib/sources";
import { collectSlots, normalizeInfo, railFor, type RailId } from "@/lib/slots";
import { lyricView, parseLyrics } from "@/lib/lyrics";
import { setHours24 } from "@/lib/format";
import { resolvePulse, reloadDue } from "@/lib/pulse";
import { cssVars, resolveTheme } from "@/lib/theme";
import { mockData, mockHome, type Scenario } from "@/lib/mock";
import type { ScreenData } from "@/lib/types";
import { post, useApi } from "@/lib/useApi";
import { preload, useArtColors, useStableArt } from "@/lib/useArt";
import { useLayers } from "@/lib/useLayers";
import { PinPad } from "@/components/pin";
import { HiddenTrigger } from "@/components/trigger";
import { PinGate, SettingsSheet } from "@/components/settings";
import { forcedView, type DeviceConfig, type DeviceDim, type DeviceRole, type DeviceView } from "@/lib/device";
import { inWindow } from "@/lib/scenes";
import { useDevice } from "@/lib/useDevice";
import { Rail } from "@/components/rail";
import { Takeover } from "@/components/zones";
import { Header, Foot, HEADER_MODE } from "@/components/frame";
import { Island } from "@/components/island";
import { buildActivities } from "@/lib/activities";
import { selectIsland, type IslandMemory, type IslandPage, type IslandPin } from "@/lib/island";
import { Timeline } from "@/components/timeline";
import { findOverlaps, inside, type Box } from "@/lib/layout";
import { applyHome, applyMusic, blendPosition, failOpt, liveEvents, overridesFor, pickLyrics, positionOf, predictMusic, reportedFor, resolveOpt, setOpt, type Opt } from "@/lib/predict";
import type { Call } from "@/lib/useApi";
import { SCENE_VIEWS } from "@/scenes";
import { PAGES } from "@/calm";

// The page does five jobs: fetch what Permuta saved; decide the situation (scene: src/lib/scenes.ts; focus or calm: src/lib/focus.ts; what the
// zones carry: src/lib/sources); draw it with cross-fades; look after itself (a gentle pulse, a soft reload now and then, a reload on a new deploy);
// and stay out of the way: the rail and the touch controller are only fallbacks, and the controller closes itself.

const MOCK = process.env.NEXT_PUBLIC_DASH_MOCK === "1";   // local test harness only (set when building locally; never on Vercel)
type Pin = { key: string; until: number };                  // tapping the rail pins a view for a minute

export default function Page() {
  const api = useApi();
  const [real, setReal] = useState<ScreenData | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [offset, setOffset] = useState(0);                       // mock only: pretend it is another time of day
  const [clock, setClock] = useState(() => Date.now());
  const [fast, setFast] = useState(() => Date.now());           // 4 Hz, only while lyrics are on screen
  const [apiOk, setApiOk] = useState(true);
  const [pulsing, setPulsing] = useState(false);
  const [sceneState, setSceneState] = useState<SceneState | null>(null);
  const [modeState, setModeState] = useState<ModeState | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [mockOpts, setMockOpts] = useState<{ scenario: Scenario; long: boolean; force: SceneId | null; pulse?: number; page?: string; lyrics: boolean; h24?: boolean; font?: string }>({ scenario: "idle", long: false, force: null, lyrics: true });
  const [mounted, setMounted] = useState(false);              // the first paint happens in the browser only: the clock must never be rendered on the server
  useEffect(() => setMounted(true), []);
  const [sheet, setSheet] = useState(false);                  // the hidden Screen settings sheet
  const [gate, setGate] = useState(false);                    // the PIN again, on a locked screen
  const [awakeUntil, setAwakeUntil] = useState(0);            // a dimmed control panel goes bright on touch
  const lastFire = useRef(0);
  const [islandPin, setIslandPin] = useState<IslandPin | null>(null);        // a tapped satellite becomes the main item for 10 s
  const islandMem = useRef<IslandMemory>({ mainId: null, since: 0 });
  const [optMap, setOptMap] = useState<Opt>({});               // optimistic overrides: what the user just did shows at once
  const shownPos = useRef<{ id: string; pos: number; t: number } | null>(null);
  const homeRef = useRef<Home | null>(null);
  const [mockBare, setMockBare] = useState(false);
  const mockHomeData = useMemo(() => (MOCK ? mockHome(mockBare) : null), [mockBare]);
  const [mockDev] = useState<Partial<DeviceConfig> | null>(() => {      // mock only: ?role=control&view=home&device=locked&name=Kitchen&dim=never
    if (!MOCK || typeof location === "undefined") return null;
    const q = new URLSearchParams(location.search), d: Partial<DeviceConfig> = {};
    if (q.get("role")) d.role = q.get("role") as DeviceRole; if (q.get("view")) d.view = q.get("view") as DeviceView; if (q.get("dim")) d.dim = q.get("dim") as DeviceDim;
    if (q.get("device") === "locked") d.locked = true; if (q.get("name")) d.name = q.get("name")!;
    return d;
  });
  const fails = useRef(0);
  const loadedAt = useRef(Date.now());
  const version = useRef<string | null>(null);
  const [newVersion, setNewVersion] = useState(false);
  const lastFocus = useRef<ReturnType<typeof decide>["focus"]>(undefined);
  const firstSeen = useRef<Record<string, number>>({});
  const unlocked = MOCK || !!api.pin;
  const now = clock + offset;

  // ----- mock harness options (?mock=music&at=23:30&long=1&scene=night&page=mail&lyrics=0) -----
  useEffect(() => {
    if (!MOCK) return;
    const q = new URLSearchParams(location.search);
    setMockOpts({ scenario: (q.get("mock") as Scenario) || "idle", long: q.get("long") === "1", force: (q.get("scene") as SceneId) || null, pulse: Number(q.get("pulse")) || undefined, page: q.get("page") || undefined, lyrics: q.get("lyrics") !== "0", h24: q.get("h24") === "1", font: q.get("font") || undefined });
    if (q.get("font") === "b") { document.documentElement.style.setProperty("--nf-text", "var(--nf-text-b)"); document.documentElement.style.setProperty("--nf-num", "var(--nf-num-b)"); }
    (window as unknown as { __dash: unknown }).__dash = { set: (sc: Scenario) => setMockOpts((o) => ({ ...o, scenario: sc })) };   // test hook: change the situation live
    (window as unknown as { __layoutCheck: unknown }).__layoutCheck = () => {            // walks the rendered boxes and reports overlaps (test harness)
      if (!document.getElementById("__nomotion")) { const st = document.createElement("style"); st.id = "__nomotion"; st.textContent = "*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }"; document.head.appendChild(st); }   // measure the final layout, not a frame mid-transition
      void document.body.offsetHeight;
      const box = (el: Element, name: string): Box => { const r = el.getBoundingClientRect(); return { name, x: r.left, y: r.top, w: r.width, h: r.height }; };
      const vis = (el: Element) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.05; };
      const overlaps: [string, string][] = [], outside: string[] = [];
      const siblings = (sel: string, label: string) => document.querySelectorAll(sel).forEach((parent, pi) => {
        const kids = [...parent.children].filter((c) => vis(c) && !["absolute", "fixed"].includes(getComputedStyle(c).position)).map((c, i) => box(c, `${label}${pi}>${(c as HTMLElement).className.toString().split(" ")[0] || c.tagName}${i}`));
        overlaps.push(...findOverlaps(kids));
      });
      const areas = ["rail", "head", "hero", "foot"].map((n) => document.querySelector(`[data-area="${n}"]`)).filter((e): e is Element => !!e && vis(e) && e.getBoundingClientRect().height > 0).map((e) => box(e, (e as HTMLElement).dataset.area!));
      overlaps.push(...findOverlaps(areas));
      siblings(".hdr", "hdr"); siblings(".isl", "isl"); siblings(".isl-sats", "sats"); siblings(".hdr-l", "hdr-l"); siblings(".hdr-r", "pills"); siblings(".foot-row", "foot"); siblings(".strip-row", "strip"); siblings(".layer:not(.leaving) .sc", "sc"); siblings(".layer:not(.leaving) .sc > *", "blk"); siblings(".mmeta", "mmeta");
      const evs = [...document.querySelectorAll(".tl-event")].filter(vis).map((e, i) => box(e, `tl-event${i}`)); overlaps.push(...findOverlaps(evs));
      const vp: Box = { name: "viewport", x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
      document.querySelectorAll('[data-area="head"] *, [data-area="foot"] *, .layer:not(.leaving) .sc *').forEach((e) => { if (vis(e) && e.getBoundingClientRect().width > 0 && !(e.closest(".lyrics, .gtitle") && getComputedStyle(e).position === "absolute") && !inside(box(e, "x"), vp, 3)) outside.push(((e as HTMLElement).className?.toString() || e.tagName).slice(0, 40)); });
      return { overlaps, outside: [...new Set(outside)], viewport: [window.innerWidth, window.innerHeight] };
    };
    setMockBare(q.get("mock") === "bare");
    const go = q.get("go");
    if (go) setPin({ key: { today: "scene:idle", calendar: "scene:day", music: "scene:music", home: "page:home", mail: "page:mail", journal: "page:journal" }[go] ?? "scene:idle", until: Date.now() + 1e11 });
    const at = q.get("at");
    if (at && /^\d{1,2}:\d{2}$/.test(at)) { const [h, m] = at.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); setOffset(d.getTime() - Date.now()); }
  }, []);
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, []);

  // ----- data -----
  const loadScreen = useCallback(async () => {
    if (MOCK || !api.pin) return;
    try {
      const r = await api.call("/api/screen");
      if (!r.ok) throw new Error(String(r.status));
      setReal(await r.json()); fails.current = 0; setApiOk(true);
    } catch (e) { if ((e as Error).message === "locked") return; if (++fails.current >= 3) setApiOk(false); }
  }, [api]);
  const loadHome = useCallback(async () => {
    if (MOCK || !api.pin) return;
    try { const r = await api.call("/api/home"); if (r.ok) setHome(await r.json()); } catch {}
  }, [api]);
  useEffect(() => { if (!unlocked || MOCK) return; loadScreen(); const t = setInterval(loadScreen, 5000); return () => clearInterval(t); }, [unlocked, loadScreen]);

  const nowSec = Math.floor(now / 1000);
  const data: ScreenData | null = useMemo(() => (MOCK ? (() => { const d = mockData(mockOpts.scenario, nowSec * 1000, mockOpts.long, mockOpts.pulse, mockOpts.lyrics); return mockOpts.h24 ? { ...d, screen: { ...d.screen, hours24: true } } : d; })() : real), [real, mockOpts, nowSec]);

  // ----- the situation -----
  const cfg = data?.screen ?? null;
  setHours24(cfg?.hours24);                                    // every time on screen follows config:screen.hours24 (12-hour by default)
  const widgets = cfg?.widgets ?? ["clock", "weather", "agenda", "music"];
  const theme = useMemo(() => resolveTheme(data?.theme, data?.screen?.accent), [data?.theme, data?.screen?.accent]);
  const events = useMemo(() => liveEvents(data?.agenda?.events ?? [], now), [data?.agenda, now]);           // a passed event drops out on its own
  // ----- music: the clock decides, reports only correct it (rollover to the next song, gentle reconcile, optimistic keys) -----
  const rawMusic = data?.music && data.music.track ? data.music : null;
  const predicted = useMemo(() => {
    const p = predictMusic(rawMusic, now);
    if (!p) { shownPos.current = null; return null; }
    const id = p.trackId ?? p.track, target = positionOf(p, now), prev = shownPos.current;
    const pos = prev && prev.id === id && p.playing ? blendPosition(prev.pos, target, Math.min(5, Math.max(0, (now - prev.t) / 1000))) : target;
    shownPos.current = { id, pos, t: now };
    return { ...p, progress: pos, at: now };
  }, [rawMusic, nowSec]);   // eslint-disable-line react-hooks/exhaustive-deps
  const music = useMemo(() => applyMusic(predicted, optMap), [predicted, optMap]);
  const homeView = useMemo(() => applyHome(MOCK ? mockHomeData : home, optMap), [home, optMap, mockHomeData]);
  homeRef.current = MOCK ? mockHomeData : home;
  useEffect(() => { setOptMap((m) => resolveOpt(m, reportedFor(m, homeRef.current, rawMusic), Date.now())); }, [nowSec, home, rawMusic]);   // confirmed or expired overrides drop out
  const away = !!data?.status?.away || !!homeView?.away;
  const sceneCfg = useMemo(() => ({ ...cfg, disabled: [...(cfg?.disabled ?? []), ...(widgets.includes("music") ? [] : (["music"] as SceneId[]))] }), [cfg, widgets]);
  const decision = decide({
    now, events, music: music ? { playing: music.playing, track: music.track, at: music.at } : null, away,
    statusAt: data?.status?.at ?? null, apiOk, hasData: !!data, config: sceneCfg,
  }, sceneState?.scene);
  const dwell = resolveConfig(sceneCfg).minDwellSec;
  useEffect(() => { setSceneState((prev) => settle(prev, decision, now, dwell)); }, [decision.scene, now, dwell]);   // eslint-disable-line react-hooks/exhaustive-deps
  const scene: SceneId = (MOCK ? mockOpts.force : null) ?? sceneState?.scene ?? decision.scene;
  if (decision.focus) lastFocus.current = decision.focus;

  // ----- information sources, focus or calm -----
  const viewEvents = widgets.includes("agenda") ? events : [];
  const baseCtx: SourceCtx = { now, scene, events: viewEvents, music, weather: widgets.includes("weather") ? data?.weather ?? null : null, away, extra: data?.extra ?? {}, soonLeadMin: resolveConfig(sceneCfg).soonLeadMin };
  const { score } = focusScore(baseCtx);
  const focusCfg = resolveFocus(cfg);
  useEffect(() => { setModeState((prev) => decideMode(prev, { scene, score, now, cfg: focusCfg })); }, [scene, score, now, focusCfg.focusThreshold, focusCfg.calmAfterSec]);   // eslint-disable-line react-hooks/exhaustive-deps
  const calm = (modeState?.mode === "calm" && scene === "idle") || (MOCK && !!mockOpts.page);
  const pages = calmPages(baseCtx);
  const rot = rotation(pages, now, focusCfg.pageSec);

  // ----- this screen's own role and view (the server is the authority; changes apply live) -----
  const device = useDevice({ call: api.call, unlocked, scene, mode: calm ? "calm" : "focus", ver: version.current, mock: MOCK ? mockDev : null });
  const forced = forcedView(device.cfg);
  const controlMode = forced.kind === "control";
  const infoItems = useMemo(() => normalizeInfo(data?.info), [data?.info]);
  const slots = collectSlots({ now, scene, events: viewEvents, info: [...sourceItems(baseCtx), ...infoItems] }, []);     // the sources supply every item (no built-in providers on top)
  const lyricsNow = useMemo(() => parseLyrics(data?.lyrics), [data?.lyrics]);
  const lyricsNext = useMemo(() => parseLyrics(data?.lyricsNext), [data?.lyricsNext]);
  const lyrics = pickLyrics(music?.lyricsId ?? music?.trackId, lyricsNow, lyricsNext);      // the next song's lines after a predicted rollover
  const lyricsOn = !!music?.playing && !!lyrics;
  useEffect(() => { if (!lyricsOn) return; const t = setInterval(() => setFast(Date.now()), 250); return () => clearInterval(t); }, [lyricsOn]);
  const lyric = lyricsOn && music ? lyricView({ ...music, trackId: lyrics?.id }, lyrics, fast + offset) : null;

  // takeover: an urgent item shows until it expires (default five minutes from first seen)
  let takeover = slots.takeover;
  if (takeover) { const seen = (firstSeen.current[takeover.id] ??= now); if ((takeover.until ?? seen + 5 * 60000) <= now) takeover = null; }

  // ----- what's on screen: a scene (focus) or a calm page, or something pinned from the rail -----
  const pinned = pin && pin.until > now ? pin.key : null;
  const computedKey = calm ? `page:${(MOCK && mockOpts.page) || rot.id}` : `scene:${scene}`;
  const viewKey = forced.kind === "control" ? "page:home" : forced.kind === "scene" ? `scene:${forced.scene}` : forced.kind === "calm" ? `page:${(MOCK && mockOpts.page) || rot.id}` : pinned ?? computedKey;       // a pinned view on this screen beats auto
  useEffect(() => { if (!unlocked || MOCK) return; loadHome(); const t = setInterval(loadHome, viewKey === "page:home" ? 3000 : 20000); return () => clearInterval(t); }, [unlocked, loadHome, viewKey]);   // the Home page refreshes faster while it's on screen
  const shownScene = viewKey.startsWith("scene:") ? (viewKey.slice(6) as SceneId) : scene;
  const showingPage = viewKey.startsWith("page:");

  // ----- art, accent, backdrop -----
  const art = useStableArt(music?.art);
  const colors = useArtColors(art);
  useEffect(() => { preload(music?.next?.art); }, [music?.next?.art]);
  const accent = shownScene === "music" && !showingPage ? (music?.palette?.[0] && /^#[0-9a-fA-F]{6}$/.test(music.palette[0]) ? music.palette[0] : colors?.accent ?? null) : null;
  const vars = useMemo(() => cssVars(theme, accent), [theme, accent]);
  useEffect(() => { for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v); }, [vars]);

  // ----- look after itself -----
  const pulseCfg = resolvePulse(cfg);
  useEffect(() => {
    if (!unlocked) return;
    const t = setInterval(() => { setPulsing(true); setTimeout(() => setPulsing(false), 1900); loadScreen(); loadHome(); }, pulseCfg.pulseMin * 60000);
    return () => clearInterval(t);
  }, [unlocked, pulseCfg.pulseMin, loadScreen, loadHome]);
  useEffect(() => {
    if (!unlocked || MOCK) return;
    const check = async () => { try { const v = (await (await fetch("/api/version", { cache: "no-store" })).json()).v as string; if (version.current === null) version.current = v; else if (v !== version.current) setNewVersion(true); } catch {} };
    check(); const t = setInterval(check, pulseCfg.versionMin * 60000);
    return () => clearInterval(t);
  }, [unlocked, pulseCfg.versionMin]);
  const sceneRef = useRef(scene); sceneRef.current = scene;
  const interactingRef = useRef(false);
  const newRef = useRef(newVersion); newRef.current = newVersion;
  useEffect(() => {
    if (!unlocked || MOCK) return;
    const t = setInterval(() => { if (reloadDue({ now: Date.now(), loadedAt: loadedAt.current, scene: sceneRef.current, newVersion: newRef.current, reloadMin: pulseCfg.reloadMin, interacting: interactingRef.current })) location.reload(); }, 30000);
    return () => clearInterval(t);
  }, [unlocked, pulseCfg.reloadMin]);

  const layers = useLayers(viewKey, 900);
  // every control applies at once (optimistic) and is reverted only if the request fails or the reports still disagree after ~6 s
  const callOpt: Call = useCallback(async (path, init) => {
    let keys: string[] = [];
    if (path === "/api/act" && init?.body) { try { const patch = overridesFor(JSON.parse(String(init.body)), homeRef.current); keys = Object.keys(patch); if (keys.length) setOptMap((m) => setOpt(m, patch, Date.now())); } catch {} }
    if (MOCK) return new Response("{}", { status: 200 });
    try { const r = await api.call(path, init); if (!r.ok && keys.length) setOptMap((m) => failOpt(m, keys)); return r; } catch (e) { if (keys.length) setOptMap((m) => failOpt(m, keys)); throw e; }
  }, [api]);
  const control = useCallback((cmd: Record<string, unknown>) => { post(callOpt, { op: "permuta", cmd: { type: "music", ...cmd } }); }, [callOpt]);
  const pick = (id: RailId) => {
    const until = Date.now() + offset + 60000;
    if (id === "home") { setPin({ key: "page:home", until }); return; }
    if (id === "today") setPin({ key: "scene:idle", until }); else if (id === "calendar") setPin({ key: "scene:day", until });
    else if (id === "music") setPin({ key: music ? "scene:music" : "scene:idle", until }); else setPin({ key: `page:${id}`, until });
  };

  if (!mounted || (!MOCK && !api.checked)) return null;
  if (!unlocked) return <PinPad unlock={api.unlock} />;

  // the hidden settings trigger: hold a clock for 3 s, or tap the top-left corner five times
  const trigger = () => { lastFire.current = Date.now(); if (device.cfg.locked) setGate(true); else setSheet(true); };
  const verify = async (p: string) => { const ok = MOCK ? p === "4242" : (await fetch("/api/unlock", { method: "POST", headers: { "x-control-pin": p } })).ok; if (ok) { setGate(false); setSheet(true); } return ok; };
  const overlays = (
    <>
      <HiddenTrigger onFire={trigger} />
      {sheet && <SettingsSheet cfg={device.cfg} save={device.save} onClose={() => setSheet(false)} onForget={() => { setSheet(false); api.forget(); }} id={device.id} online={device.online} lastSync={device.lastSync} />}
      {gate && <PinGate verify={verify} onCancel={() => setGate(false)} />}
    </>
  );
  const nightNow = inWindow(new Date(now).getHours(), resolveConfig(sceneCfg).nightStart, resolveConfig(sceneCfg).nightEnd);

  const ctx: SourceCtx = { ...baseCtx, scene: shownScene };
  const props = { now, data: data && !widgets.includes("weather") ? { ...data, weather: null } : data, theme, away, events: viewEvents, music, art, lyric, slots, ctx, control, home: homeView, call: callOpt, reloadHome: loadHome, hideRooms: cfg?.hideRooms ?? [] };
  const backdropOn = shownScene === "music" && !showingPage && !!art;
  const railHidden = scene === "night" || scene === "offline" || controlMode;
  const activeRail: RailId | null = showingPage ? (viewKey.slice(5) === "home" ? "home" : viewKey.slice(5) === "mail" ? "mail" : viewKey.slice(5) === "journal" ? "journal" : viewKey.slice(5) === "today" ? "calendar" : "today") : railFor(shownScene);
  const zonesOn = (!showingPage || viewKey === "page:home") && !railHidden;
  const headerMode = showingPage ? (viewKey === "page:home" ? "full" : "island") : HEADER_MODE[shownScene];
  const timeline = !showingPage && (shownScene === "soon" || shownScene === "day") ? <Timeline events={viewEvents} now={now} compact={shownScene === "soon"} /> : undefined;
  // the island: the most pressing thing from OTHER pages, satellites beside it
  const currentPage = (activeRail ?? "today") as IslandPage;
  const activities = buildActivities({ ...ctx, music }, { takeover, musicLights: !!homeView?.musicLights, lightsOn: homeView ? homeView.devices.filter((d) => (d.kind === "light" || d.kind === "plug") && d.on).length : 0 });
  const sel = selectIsland({ currentPage, activities, now, previous: islandMem.current, pin: islandPin });
  islandMem.current = sel.memory;
  const islandNode = <Island sel={sel} now={now} music={music} events={viewEvents} accent={theme.accent} control={control} act={(b) => { post(callOpt, b); }}
    onPin={(id) => setIslandPin({ id, until: Date.now() + offset + 10000 })} onGo={(page) => pick(page === "weather" || page === "any" ? "today" : (page as RailId))} />;
  const noSlots = { pills: [], strip: [], badges: {}, peek: null, takeover: null };

  return (
    <div className={`root ${railHidden ? "norail" : ""}`} onPointerDownCapture={() => { setAwakeUntil(now + 60000); interactingRef.current = true; setTimeout(() => { interactingRef.current = false; }, 5000); setPin((p) => (p && p.until > Date.now() + offset ? { ...p, until: Date.now() + offset + (p.key === "page:home" ? 120000 : 60000) } : p)); }}>
      <div className="tint" />
      <div className={`backdrop ${backdropOn ? "on" : ""} ${colors?.soft ? "" : "fallback"}`} style={backdropOn ? { backgroundImage: `url("${colors?.soft ?? art}")` } : undefined} />
      <div className="wash" style={{ opacity: backdropOn ? 1 : 0.35 }} />
      <div className="frame" data-area="frame">
        <aside className="area-rail" data-area="rail"><Rail active={activeRail} badges={slots.badges} hidden={railHidden} onPick={pick} /></aside>
        <header className={`area-head ${headerMode === "none" ? "empty" : ""}`} data-area="head"><Header mode={headerMode} now={now} scene={shownScene} island={islandNode} /></header>
        <main className="area-hero" data-area="hero">
          {layers.map((l) => {
            const page = l.key.startsWith("page:"), id = l.key.slice(l.key.indexOf(":") + 1);
            const View = page ? PAGES[id] ?? PAGES.standby : SCENE_VIEWS[id as SceneId];
            return <div key={l.id} className={`layer ${l.leaving ? "leaving" : ""}`}><View {...props} decision={{ ...decision, scene: (page ? "idle" : id) as SceneId, focus: decision.focus ?? lastFocus.current }} /></div>;
          })}
        </main>
        <footer className="area-foot" data-area="foot"><Foot slots={zonesOn ? slots : noSlots} showStrip={zonesOn}>{timeline}</Foot></footer>
      </div>
      <Takeover item={headerMode === "none" ? takeover : null} />
      <div className={`pulse-ring ${pulsing ? "go" : ""}`} />
      <div className="dimmer" style={{ opacity: device.cfg.dim === "never" ? 0 : controlMode ? (nightNow && awakeUntil < now ? 0.55 : 0) : decision.dim }} />
      {overlays}
    </div>
  );
}
