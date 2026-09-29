"use client";

import { useEffect } from "react";

/** Near-fullscreen overlay for the grid editor — plenty of room to drag/resize widgets
 *  without fighting the page's normal scroll and layout. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-full max-w-[1700px] glass-panel flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--surface-border)] shrink-0">
          {title ? (
            <h2 className="text-sm uppercase tracking-widest text-[var(--muted)]">{title}</h2>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--surface-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
