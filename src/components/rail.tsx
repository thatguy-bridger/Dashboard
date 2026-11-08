"use client";
import type { Badge, RailId } from "@/lib/slots";
import { Icon, type IconName } from "./Icon";

// The persistent chrome: a slim glass rail like the Permuta app's. The highlighted icon follows the scene; icons carry attention badges.
const ITEMS: { id: RailId; icon: IconName; label: string }[] = [
  { id: "today", icon: "sun", label: "Today" }, { id: "calendar", icon: "calendar", label: "Calendar" }, { id: "music", icon: "note", label: "Music" },
  { id: "home", icon: "home", label: "Home" }, { id: "mail", icon: "mail", label: "Mail" }, { id: "journal", icon: "book", label: "Journal" },
];

export function Rail({ active, badges, hidden, onPick }: { active: RailId | null; badges: Partial<Record<RailId, Badge>>; hidden: boolean; onPick: (id: RailId) => void }) {
  return (
    <nav className={`rail ${hidden ? "hidden" : ""}`} onClick={(e) => e.stopPropagation()} aria-label="Sections">
      {ITEMS.map((it) => {
        const b = badges[it.id];
        return (
          <button key={it.id} className={`railitem ${active === it.id ? "on" : ""}`} onClick={() => onPick(it.id)} aria-label={it.label}>
            <Icon name={it.icon} />
            {b && (b.count ? <span className="badge" style={b.color ? { background: b.color } : undefined}>{b.count > 9 ? "9+" : b.count}</span> : b.dot ? <span className="badge dotb" style={b.color ? { background: b.color } : undefined} /> : null)}
          </button>
        );
      })}
    </nav>
  );
}
