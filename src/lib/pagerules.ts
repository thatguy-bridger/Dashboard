// Which calm pages may rotate in right now. Permuta sends config.pageRules = { pageId: [on, fromHour, toHour] }; a page with no rule is always allowed.
// A window may wrap midnight (22 to 6). 0 to 24 is all day.
export type PageRules = Record<string, number[]> | null | undefined;

export function pageAllowed(rules: PageRules, id: string, hour: number): boolean {
  const r = rules?.[id];
  if (!r || r.length < 3) return true;
  const [on, from, to] = r;
  if (!on) return false;
  if (from === to || (from <= 0 && to >= 24)) return true;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Filters the page list, but never to nothing: standby is the fallback. */
export function allowedPages(pages: string[], rules: PageRules, hour: number): string[] {
  const out = pages.filter((p) => pageAllowed(rules, p, hour));
  return out.length ? out : ["standby"];
}
