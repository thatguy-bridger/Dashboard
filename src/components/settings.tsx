"use client";
import { useEffect, useState } from "react";
import { VIEWS, type DeviceConfig, type DeviceRole, type DeviceView } from "@/lib/device";
import { Icon } from "./Icon";
import { PinPad } from "./pin";
import { GlassGroup } from "./glass";
import { ROLES, DIMS } from "@/lib/device";

const VIEW_LABEL: Record<DeviceView, string> = { auto: "Auto", standby: "Standby", music: "Music", timeline: "Timeline", calm: "Calm pages", home: "Home control" };
const ROLE_LABEL: Record<DeviceRole, string> = { display: "Display", control: "Control panel" };

/** The Screen settings sheet (opened by the hidden trigger). Changes apply at once and are saved to the server. */
export function SettingsSheet({ cfg, save, onClose, onForget, id, online, lastSync }: { cfg: DeviceConfig; save: (p: Partial<DeviceConfig>) => void; onClose: () => void; onForget: () => void; id: string; online: boolean; lastSync: number | null }) {
  const [name, setName] = useState(cfg.name);
  useEffect(() => setName(cfg.name), [cfg.name]);
  const commitName = () => { if (name.trim() !== cfg.name) save({ name: name.trim() }); };
  return (
    <div className="sheet settings" onClick={(e) => e.stopPropagation()}>
      <div className="tabs"><div className="cap" style={{ fontSize: "calc(1.8 * var(--u))" }}>Screen settings</div><span style={{ flex: 1 }} /><button className="tab" onClick={onClose}>Close</button></div>
      <div className="setgrid">
        <div className="card setcard">
          <div className="cap">Name</div>
          <div className="row"><input className="nameinput" value={name} maxLength={40} placeholder="Kitchen panel" onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === "Enter") { commitName(); (e.target as HTMLInputElement).blur(); } }} /><button className="chip" onClick={commitName}>Save</button></div>
          <div className="small">Shown in Permuta so you can tell your screens apart.</div>
        </div>
        <div className="card setcard">
          <div className="cap">Role</div>
          <GlassGroup className="steps glass" active={ROLES.indexOf(cfg.role)}>{(Object.keys(ROLE_LABEL) as DeviceRole[]).map((r) => <button key={r} data-gi-item className={cfg.role === r ? "on" : ""} onClick={() => save({ role: r })}>{ROLE_LABEL[r]}</button>)}</GlassGroup>
          <div className="small">A display shows the situational page. A control panel is a full-time home-control touch panel.</div>
        </div>
        <div className="card setcard wide">
          <div className="cap">View</div>
          <GlassGroup className="steps glass wrapsteps" active={VIEWS.indexOf(cfg.view)}>{VIEWS.map((v) => <button key={v} data-gi-item className={cfg.view === v ? "on" : ""} onClick={() => save({ view: v })}>{VIEW_LABEL[v]}</button>)}</GlassGroup>
          <div className="small">Auto lets the page choose from the situation. Anything else keeps this screen on that view all the time.</div>
        </div>
        <div className="card setcard">
          <div className="cap">Lock</div>
          <div className="row"><button className={`switch ${cfg.locked ? "on" : ""}`} role="switch" aria-checked={cfg.locked} onClick={() => save({ locked: !cfg.locked })}><i /></button><div className="mid">{cfg.locked ? "Locked" : "Unlocked"}</div></div>
          <div className="small">When locked, opening this sheet asks for the PIN again.</div>
        </div>
        <div className="card setcard">
          <div className="cap">Guest mode</div>
          <div className="row"><button className={`switch ${cfg.guest ? "on" : ""}`} role="switch" aria-checked={cfg.guest} onClick={() => save({ guest: !cfg.guest })}><i /></button><div className="mid">{cfg.guest ? "On" : "Off"}</div></div>
          <div className="small">Shows only the lights and the fan. The PIN lifts it for 4 hours.</div>
        </div>
        <div className="card setcard">
          <div className="cap">Dimming</div>
          <GlassGroup className="steps glass" active={DIMS.indexOf(cfg.dim)}>{(["auto", "never"] as const).map((d) => <button key={d} data-gi-item className={cfg.dim === d ? "on" : ""} onClick={() => save({ dim: d })}>{d === "auto" ? "Dim at night" : "Never dim"}</button>)}</GlassGroup>
        </div>
      </div>
      <div className="row setfoot">
        <button className="chip" onClick={onForget}><Icon name="alert" /> Forget PIN on this device</button>
        <button className="chip" onClick={() => location.reload()}>Reload</button>
        <span style={{ flex: 1 }} />
        <span className="small">{online ? (lastSync ? "Synced" : "Not synced yet") : "Offline: using the last settings"} · {id.slice(0, 6)}</span>
      </div>
    </div>
  );
}

/** Before the sheet opens on a locked screen: the PIN again, on the same keypad. */
export function PinGate({ verify, onCancel }: { verify: (pin: string) => Promise<boolean>; onCancel: () => void }) {
  return (
    <div className="gate" onClick={(e) => e.stopPropagation()}>
      <PinPad unlock={verify} />
      <button className="chip gatecancel" onClick={onCancel}>Cancel</button>
    </div>
  );
}
