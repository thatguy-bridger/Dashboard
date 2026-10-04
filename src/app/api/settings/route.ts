import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings, type MapPlace, type FavoriteTeam, type DisplayMode, type LayoutMode } from "@/lib/settings";

function parseTeamsPatch(raw: unknown): FavoriteTeam[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const teams = raw.filter(
    (t): t is FavoriteTeam =>
      t && typeof t === "object" && typeof t.id === "string" && typeof t.name === "string"
  );
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    badge: typeof t.badge === "string" ? t.badge : null,
    sport: typeof t.sport === "string" ? t.sport : null,
    league: typeof t.league === "string" ? t.league : null,
  }));
}

function parsePlacePatch(raw: unknown): MapPlace | null | undefined {
  if (raw === null) return null;
  if (raw && typeof raw === "object") {
    const label = (raw as { label?: unknown }).label;
    const lat = (raw as { lat?: unknown }).lat;
    const lon = (raw as { lon?: unknown }).lon;
    if (typeof label === "string" && typeof lat === "number" && typeof lon === "number") {
      return { label, lat, lon };
    }
  }
  return undefined;
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const patch: {
    favoriteTeam?: string | null;
    favoriteTeams?: FavoriteTeam[];
    mapHome?: MapPlace | null;
    mapDestination?: MapPlace | null;
    displayMode?: DisplayMode;
    layoutMode?: LayoutMode;
  } = {};

  if (body.favoriteTeam === null || typeof body.favoriteTeam === "string") {
    patch.favoriteTeam = body.favoriteTeam;
  }
  if ("favoriteTeams" in body) {
    const teams = parseTeamsPatch(body.favoriteTeams);
    if (teams !== undefined) patch.favoriteTeams = teams;
  }
  if ("mapHome" in body) {
    const place = parsePlacePatch(body.mapHome);
    if (place !== undefined) patch.mapHome = place;
  }
  if ("mapDestination" in body) {
    const place = parsePlacePatch(body.mapDestination);
    if (place !== undefined) patch.mapDestination = place;
  }
  if (body.displayMode === "color" || body.displayMode === "image") {
    patch.displayMode = body.displayMode;
  }

  if (body.layoutMode === "standby" || body.layoutMode === "grid") {
    patch.layoutMode = body.layoutMode;
  }

  const settings = await updateSettings(patch);
  return NextResponse.json({ settings });
}
