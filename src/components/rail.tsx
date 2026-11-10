"use client";
import type { Badge, RailId } from "@/lib/slots";
import { GlassGroup } from "./glass";
import { Icon, type IconName } from "./Icon";

// The persistent chrome: a slim glass rail like the Permuta app's. One glass indicator slides to the active icon (it follows the scene, or a tap); badges sit above it.
export const RAIL_ITEMS: { id: RailId; icon: IconName; label: string }[] = [
  { id: "today", icon: "sun", label: "Today" }, { id: "calendar", icon: "calendar", label: "Calendar" }, { id: "music", icon: "note", label: "Music" },
  { id: "weather", icon: "cloud-sun", label: "Weather" }, { id: "home", icon: "home", label: "Home" }, { id: "mail", icon: "mail", label: "Mail" }, { id: "journal", icon: "book", label: "Journal" },
];

export function Rail({ active, badges, hidden, onPick, onLock, locked }: { active: RailId | null; badges: Partial<Record<RailId, Badge>>; hidden: boolean; onPick: (id: RailId) => void; onLock?: (id: RailId) => void; locked?: RailId | null }) {
  const idx = active ? RAIL_ITEMS.findIndex((i) => i.id === active) : -1;
  return (
    <nav className={`rail ${hidden ? "hidden" : ""}`} onClick={(e) => e.stopPropagation()} aria-label="Sections">
      <GlassGroup active={idx >= 0 ? idx : null} className="railgroup">
        {RAIL_ITEMS.map((it) => {
          const b = badges[it.id];
          return (
            <button key={it.id} data-gi-item className={`railitem ${active === it.id ? "on" : ""} ${locked === it.id ? "locked" : ""}`} onClick={() => onPick(it.id)} onDoubleClick={() => onLock?.(it.id)} aria-label={it.label}>
              <Icon name={it.icon} />
              {b && (b.count ? <span className="badge" style={b.color ? { background: b.color } : undefined}>{b.count > 9 ? "9+" : b.count}</span> : b.dot ? <span className="badge dotb" style={b.color ? { background: b.color } : undefined} /> : null)}
            </button>
          );
        })}
      </GlassGroup>
    </nav>
  );
}
