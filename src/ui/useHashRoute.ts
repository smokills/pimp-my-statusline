// useHashRoute — the app's only routing. Two routes: the marketing landing ('/')
// and the full-screen builder ('#/build'). parseRoute is a pure function (unit-
// tested); the hook subscribes to hashchange and re-renders on navigation.
//
// We intentionally avoid a router library: the surface is two routes and a hash
// is enough. `#/build` (and anything starting with it) → 'build'; everything
// else → 'landing'. Empty/`#`/`#/` all land on the landing page.

import { useEffect, useState } from 'react'

export type Route = 'landing' | 'build'

/** Map a location hash to a route. Tolerant of leading '#', '#/', trailing
 *  slashes and query-ish suffixes so `#/build`, `#build`, `#/build/` all work. */
export function parseRoute(hash: string): Route {
  // Strip a single leading '#', then a single leading '/'.
  let h = hash.startsWith('#') ? hash.slice(1) : hash
  if (h.startsWith('/')) h = h.slice(1)
  // Take the first path segment (ignore trailing slash / query).
  const seg = h.split(/[/?#]/)[0].toLowerCase()
  return seg === 'build' ? 'build' : 'landing'
}

/** Subscribe to the current hash route. SSR/no-window safe (returns 'landing'). */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? 'landing' : parseRoute(window.location.hash),
  )

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    // Resync once on mount in case the hash changed before the listener attached.
    onChange()
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

/** Imperatively navigate. Setting the hash triggers the hashchange listener. */
export function navigate(route: Route): void {
  if (typeof window === 'undefined') return
  window.location.hash = route === 'build' ? '#/build' : '#/'
}
