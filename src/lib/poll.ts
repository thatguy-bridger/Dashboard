import { isDormant, onWake } from "@/lib/dormant";

/** setInterval for fetching: skips ticks while the screen is hidden or dormant (nobody is using it) and catches up the moment
 *  it wakes. Every screen polling in the background costs serverless invocations (free tier: 1M/month) and battery, so
 *  nothing should poll while nobody can see it. */
export function pollEvery(fn: () => void, ms: number): () => void {
  let last = Date.now();
  const tick = () => {
    if (isDormant()) return;
    last = Date.now();
    fn();
  };
  const id = setInterval(tick, ms);
  const catchUp = () => {
    if (!isDormant() && Date.now() - last >= ms / 2) tick();
  };
  document.addEventListener("visibilitychange", catchUp);
  const unwake = onWake(catchUp);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", catchUp);
    unwake();
  };
}
