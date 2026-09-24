"use client";

import { useEffect, useState } from "react";

type Status = "disconnected" | "pending_code" | "connected" | "error" | null;

export function FindMyConnect() {
  const [status, setStatus] = useState<Status>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/icloud/findmy", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setStatus(json.status);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitPassword() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/icloud/findmy/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "login failed");
      setPassword("");
      setStatus(json.needsCode ? "pending_code" : "connected");
      if (json.needsCode) setMessage("Enter the 6-digit code sent to your trusted device.");
    } catch (err) {
      setMessage(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/icloud/findmy/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "verification failed");
      setCode("");
      setStatus("connected");
      setMessage("Connected.");
    } catch (err) {
      setMessage(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <p className="text-sm text-[var(--muted)]">
        Uses your full Apple ID password (not the app-specific password used for calendar) plus a
        one-time 2FA code. This is an unofficial, reverse-engineered API — Apple could change it at
        any time.
      </p>

      <div className="text-sm">
        Status:{" "}
        <span className="font-medium">
          {status === "connected" && "Connected"}
          {status === "pending_code" && "Waiting for 2FA code"}
          {status === "disconnected" && "Not connected"}
          {status === "error" && "Error"}
          {status === null && "Checking…"}
        </span>
      </div>

      {(status === "disconnected" || status === "error") && (
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Apple ID password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 text-sm rounded-lg border border-[var(--surface-border)] bg-transparent px-3 py-1.5"
          />
          <button
            onClick={submitPassword}
            disabled={busy || !password}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] disabled:opacity-50"
          >
            Sign in
          </button>
        </div>
      )}

      {status === "pending_code" && (
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 text-sm rounded-lg border border-[var(--surface-border)] bg-transparent px-3 py-1.5"
          />
          <button
            onClick={submitCode}
            disabled={busy || code.length !== 6}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] disabled:opacity-50"
          >
            Verify
          </button>
        </div>
      )}

      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}
