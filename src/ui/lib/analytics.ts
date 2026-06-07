// Thin wrapper over GoatCounter's event API. Pageviews are wired in index.html
// (including hash-routed views); this is only for explicit conversion events.
//
// It is a no-op when count.js hasn't finished loading (it is async) or where
// GoatCounter declines to count anyway — localhost and IP hosts, which covers
// local dev and the build-time prerender server. So calling it is always safe.

interface GoatCounter {
  count?: (opts: { path: string; title?: string; event: boolean }) => void
}

/** Record a GoatCounter event (e.g. an export). `path` is the event id. */
export function trackEvent(path: string, title?: string): void {
  const gc = (window as unknown as { goatcounter?: GoatCounter }).goatcounter
  gc?.count?.({ path, title, event: true })
}
