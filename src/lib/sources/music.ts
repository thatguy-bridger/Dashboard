import type { InfoSource } from "./types.ts";

/** Music: the hero is the Music scene itself (and the rail already highlights it); this only supplies the focus score. */
export const music: InfoSource = {
  id: "music",
  items: () => [],
  score: (c) => (!c.music?.track ? 0 : c.music.playing ? 85 : c.now - c.music.at < 90000 ? 50 : 0),
};
