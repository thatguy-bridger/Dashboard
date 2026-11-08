import type { InfoSource } from "./types.ts";

export const away: InfoSource = {
  id: "away",
  items: (c) => (c.away ? [{ id: "away-dot", zone: "badge", title: "Away", rail: "home", dot: true }] : []),
  score: (c) => (c.away ? 55 : 0),
};
