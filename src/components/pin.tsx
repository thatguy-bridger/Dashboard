"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export function PinPad({ unlock }: { unlock: (p: string) => Promise<boolean> }) {
  const [v, setV] = useState(""); const [bad, setBad] = useState(false); const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = useCallback(async (pin: string) => {
    busyRef.current = true; setBusy(true);
    const ok = await unlock(pin);
    if (!ok) { setBad(true); setTimeout(() => { setV(""); setBad(false); busyRef.current = false; setBusy(false); }, 700); }
    // on success the page replaces this screen
  }, [unlock]);

  const press = useCallback((d: string) => {
    if (busyRef.current) return;
    setBad(false);
    setV((cur) => {
      const next = (cur + d).slice(0, 4);
      if (next.length === 4) setTimeout(() => submit(next), 120);   // four digits: send it
      return next;
    });
  }, [submit]);

  // a real or remote keyboard works too
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setV((c) => (busyRef.current ? c : c.slice(0, -1)));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [press]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", ""];
  return (
    <div className="pin">
      <div className="cap">Enter the PIN</div>
      <div className={`dots ${bad ? "bad" : ""}`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < v.length ? "on" : ""} />)}</div>
      <div className="keypad">
        {keys.map((k, i) => k === "" ? <span key={i} /> :
          <button key={i} autoFocus={k === "5"} disabled={busy && k !== "del"} aria-label={k === "del" ? "Delete" : k} onClick={() => k === "del" ? (!busyRef.current && setV((c) => c.slice(0, -1))) : press(k)}>{k === "del" ? <Icon name="backspace" /> : k}</button>)}
      </div>
      <div className="small" style={{ opacity: bad ? 1 : 0, color: "#ff8a8a" }}>That PIN didn&apos;t work</div>
    </div>
  );
}

