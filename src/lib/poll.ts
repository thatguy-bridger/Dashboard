/** setInterval that skips ticks while the tab is hidden and catches up on return.
 *  Every screen/tab polling in the background costs serverless invocations
 *  (free tier: 1M/month), so nothing should poll while nobody can see it. */
export function pollEvery(fn: () => void, ms: number): () => void {
  let last = Date.now();
  const tick = () => {
    if (document.hidden) return;
    last = Date.now();
    fn();
  };
  const id = setInterval(tick, ms);
  const onVisible = () => {
    if (!document.hidden && Date.now() - last >= ms) tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
