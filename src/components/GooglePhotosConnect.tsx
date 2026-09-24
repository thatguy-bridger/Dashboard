"use client";

import { useRef, useState } from "react";

interface PickerSession {
  id: string;
  pickerUri: string;
  pollIntervalMs: number;
  mediaItemsSet: boolean;
}

/** Google's Picker API is the only way third-party apps can get photos out
 * of a library now — this opens the hosted picker in a new tab, polls until
 * the user finishes selecting, then saves the picked item IDs. */
export function GooglePhotosConnect() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }

  async function poll(session: PickerSession) {
    try {
      const res = await fetch(`/api/photos/session/${session.id}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "poll failed");

      if (json.session.mediaItemsSet) {
        const completeRes = await fetch(`/api/photos/session/${session.id}/complete`, { method: "POST" });
        const completeJson = await completeRes.json();
        if (!completeJson.ok) throw new Error(completeJson.error || "finalize failed");
        setMessage(`Saved ${completeJson.count} photo(s).`);
        setBusy(false);
        return;
      }

      pollRef.current = setTimeout(() => poll(json.session), session.pollIntervalMs);
    } catch (err) {
      setMessage(String(err));
      setBusy(false);
    }
  }

  async function startPicking() {
    setBusy(true);
    setMessage(null);
    stopPolling();
    try {
      const res = await fetch("/api/photos/session", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "failed to start");
      window.open(json.session.pickerUri, "_blank", "noopener,noreferrer");
      setMessage("Pick photos in the new tab, then come back here.");
      poll(json.session);
    } catch (err) {
      setMessage(String(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 max-w-md">
      <p className="text-sm text-[var(--muted)]">
        Google no longer lets apps browse your whole photo library — pick specific photos below and
        they will rotate in the Photos widget. Re-pick any time to change the set.
      </p>
      <button
        onClick={startPicking}
        disabled={busy}
        className="text-xs self-start px-3 py-1.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] disabled:opacity-50"
      >
        {busy ? "Waiting for selection…" : "Pick photos"}
      </button>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}
