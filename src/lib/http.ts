/** Edge-cache hints for GET API routes. Vercel's CDN honours s-maxage, so many screens
 *  polling the same endpoint share one function invocation per window instead of
 *  each triggering their own (free tier: 1M invocations/month). */
export function cacheHeaders(sMaxAge: number): { headers: Record<string, string> } {
  return { headers: { "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}` } };
}
