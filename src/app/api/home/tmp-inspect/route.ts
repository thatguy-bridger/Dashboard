import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";

function ws<T>(U: string, messages: Record<string, unknown>[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(`${U.replace(/^http/, "ws")}/api/websocket`);
    const out: T[] = [];
    const timer = setTimeout(() => { sock.close(); reject(new Error("timeout")); }, 25000);
    sock.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.type === "auth_required") sock.send(JSON.stringify({ type: "auth", access_token: process.env.HOME_ASSISTANT_TOKEN }));
      else if (m.type === "auth_ok") messages.forEach((x, i) => sock.send(JSON.stringify({ id: i + 1, ...x })));
      else if (m.type === "result") { out[m.id - 1] = m.success ? m.result : { error: m.error }; if (out.filter((x) => x !== undefined).length === messages.length) { clearTimeout(timer); sock.close(); resolve(out); } }
    };
    sock.onerror = () => { clearTimeout(timer); reject(new Error("ws error")); };
  });
}

export async function GET(req: NextRequest) {
  if (checkPin(req.headers.get("x-control-pin")) !== "ok") return NextResponse.json({ error: "pin" }, { status: 401 });
  const U = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const item = req.nextUrl.searchParams.get("s") || "hb_fade_light_light_bar_1";
  const n = Number(req.nextUrl.searchParams.get("n")) || 4;
  const [list] = await ws<{ run_id: string; timestamp: { start: string; finish: string | null }; state: string; script_execution: string; last_step: string; error?: string }[]>(U, [{ type: "trace/list", domain: "script", item_id: item }]);
  const runs = (list ?? []).slice(-n);
  const details = await ws<{ trace?: Record<string, { timestamp: string; changed_variables?: Record<string, unknown>; error?: string }[]>; context?: unknown }>(U, runs.map((r) => ({ type: "trace/get", domain: "script", item_id: item, run_id: r.run_id })));
  const out = runs.map((r, i) => {
    const tr = details[i]?.trace ?? {};
    const keys = Object.keys(tr);
    const first = keys.map((k) => tr[k][0]).find((x) => x?.changed_variables?.frames) as { changed_variables?: { frames?: unknown[] } } | undefined;
    const frames = (first?.changed_variables?.frames ?? []) as { data?: unknown; off?: boolean; at: number }[];
    return { start: r.timestamp.start, finish: r.timestamp.finish, state: r.state, exec: r.script_execution, error: r.error, nframes: frames.length, frames: frames.map((f) => `${f.at}:${JSON.stringify(f.data ?? "off")}`).slice(0, 80) };
  });
  return NextResponse.json({ out });
}
