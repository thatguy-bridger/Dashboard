import type { Decision } from "@/lib/scenes";
import type { LyricView } from "@/lib/lyrics";
import type { SourceCtx } from "@/lib/sources";
import type { Slots } from "@/lib/slots";
import type { Theme } from "@/lib/theme";
import type { PredMusic } from "@/lib/predict";
import type { Home } from "@/lib/ha";
import type { Call } from "@/lib/useApi";
import type { Ev, ScreenData } from "@/lib/types";

/** Everything a scene (or a calm page) needs to draw itself. A different visual layer only has to implement this contract (see SCENE_VIEWS in ./index.tsx and PAGES in ../pages). */
export type SceneProps = {
  now: number;
  data: ScreenData | null;
  theme: Theme;
  decision: Decision;
  away: boolean;
  events: Ev[];                 // timed and all-day events that haven't finished, soonest first
  music: PredMusic | null;
  art: string | null;           // the cover to show (already loaded)
  lyric: LyricView | null;      // live lyrics for the playing song, or null
  slots: Slots;                 // what the zones carry right now (pills, strip, badges, peek, takeover)
  ctx: SourceCtx;               // the info-source context (extra state rows etc.)
  home: Home | null;            // Home Assistant state with the pending (optimistic) changes applied
  call: Call;                   // the optimistic request helper for /api/act
  reloadHome: () => void;
  hideRooms: string[];
  control: (cmd: Record<string, unknown>) => void;   // things only Permuta can do (music keys)
};
