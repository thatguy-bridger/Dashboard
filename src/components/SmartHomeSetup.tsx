"use client";

import { useEffect, useState } from "react";

/** Shows whether the touch screen is talking to real devices (Home Assistant) or the demo set. */
export function SmartHomeSetup() {
  const [s, setS] = useState<{ provider: string; homeAssistant: boolean; pinSet: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/home?status=1", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => setS(null));
  }, []);

  const code = "text-[var(--accent)] font-mono";
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${s?.homeAssistant ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
          {s ? (s.homeAssistant ? "Home Assistant connected" : "Demo devices") : "Checking…"}
        </span>
        {s?.homeAssistant && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${s.pinSet ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
            {s.pinSet ? "PIN set" : "No CONTROL_PIN — controls are locked"}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--muted)]">
        The touch screen (pick &quot;Touch&quot; as a device&apos;s view above) controls lights, switches, scenes and speakers through Home Assistant.
        Google Home has no web API for controlling devices, so Home Assistant is the bridge (it can import Google Cast / Nest speakers and most lights).
        Until it&apos;s connected the screen shows demo devices.
      </p>
      <ol className="text-xs text-[var(--muted)] list-decimal pl-5 flex flex-col gap-1">
        <li>In Home Assistant open your profile and create a <b>Long-Lived Access Token</b>.</li>
        <li>
          In Vercel (Project Settings, Environment Variables) add <span className={code}>HOME_ASSISTANT_URL</span> (a URL reachable from the internet, such as your Nabu Casa
          remote address), <span className={code}>HOME_ASSISTANT_TOKEN</span>, and <span className={code}>CONTROL_PIN</span> (a PIN the tablet asks for once).
        </li>
        <li>Redeploy. Rooms come from Home Assistant areas; scenes, lights, switches and media players are picked up automatically.</li>
      </ol>
    </div>
  );
}
