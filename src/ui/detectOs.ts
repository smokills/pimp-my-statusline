// detectOs — pick the TerminalMockup window chrome from the visitor's actual
// operating system, so the mockup reads as YOUR terminal. No switcher, no
// stored preference: macOS / Windows are detected from the browser (modern
// userAgentData when available, then platform/userAgent), everything else
// falls back to the Linux (GNOME) chrome.

export type OsKind = 'macos' | 'windows' | 'linux'

interface OsHints {
  platform?: string
  userAgent?: string
}

function readNavigator(): OsHints {
  if (typeof navigator === 'undefined') return {}
  // userAgentData.platform is the un-frozen signal on Chromium; the legacy
  // fields still work everywhere else (and on macOS report "MacIntel").
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData
  return {
    platform: uaData?.platform ?? navigator.platform,
    userAgent: navigator.userAgent,
  }
}

/** Detect the visitor's OS. `hints` is injectable for tests. */
export function detectOs(hints: OsHints = readNavigator()): OsKind {
  const p = (hints.platform ?? '').toLowerCase()
  const ua = (hints.userAgent ?? '').toLowerCase()
  if (p.includes('mac') || /mac os x|macintosh|iphone|ipad/.test(ua)) return 'macos'
  if (p.includes('win') || ua.includes('windows')) return 'windows'
  return 'linux'
}
