export const dynamic = "force-dynamic";

/** Which deployment is running. The page polls this and reloads itself when it changes. Not secret, so no PIN. */
export async function GET() {
  const v = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
